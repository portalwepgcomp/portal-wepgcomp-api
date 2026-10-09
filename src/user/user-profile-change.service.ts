import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Profile, Subprofile, UserAccount, UserLevel } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestProfileChangeDto } from './dto/request-profile-change.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { UserFieldCalculator } from './utils/user-field-calculator';

const PROFILE_LABELS: Record<Profile, string> = {
  Presenter: 'Apresentador',
  Professor: 'Professor',
  Listener: 'Ouvinte',
};

const SUBPROFILE_LABELS: Record<Subprofile, string> = {
  Doctorate: 'Doutorando',
  Master: 'Mestrando',
  Bachelor: 'Graduando',
  Other: 'Outro',
};

/**
 * Troca de perfil em duas etapas: o próprio usuário solicita e um admin
 * aprova ou recusa. Há no máximo uma solicitação pendente por usuário
 * (`requestedProfile` preenchido); uma nova solicitação substitui a anterior.
 */
@Injectable()
export class UserProfileChangeService {
  private readonly logger = new Logger(UserProfileChangeService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly mailingService: MailingService,
  ) {}

  async requestProfileChange(
    userId: string,
    dto: RequestProfileChangeDto,
  ): Promise<ResponseUserDto> {
    const user = await this.findUserOrFail(userId);

    if (!user.isActive) {
      throw new AppException('Conta de usuário inativa', 403);
    }

    const requestedSubprofile =
      dto.profile === Profile.Listener ? dto.subprofile! : null;

    if (
      dto.profile === user.profile &&
      (dto.profile !== Profile.Listener ||
        requestedSubprofile === user.subprofile)
    ) {
      throw new BadRequestException('Você já possui esse perfil.');
    }

    this.validateEmailForProfile(user.email, dto.profile, requestedSubprofile);

    const updatedUser = await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        requestedProfile: dto.profile,
        requestedSubprofile,
        profileRequestedAt: new Date(),
      },
    });

    void this.notifyAdmins(updatedUser);

    return new ResponseUserDto(updatedUser);
  }

  async cancelProfileChange(userId: string): Promise<ResponseUserDto> {
    await this.findPendingRequestOrFail(userId);
    const updatedUser = await this.clearRequest(userId);
    return new ResponseUserDto(updatedUser);
  }

  async approveProfileChange(
    userId: string,
    adminEmail: string,
  ): Promise<ResponseUserDto> {
    const user = await this.findPendingRequestOrFail(userId);
    const profile = user.requestedProfile!;
    const subprofile =
      profile === Profile.Listener ? user.requestedSubprofile : null;

    // O e-mail pode ter sido alterado por um admin depois da solicitação.
    this.validateEmailForProfile(user.email, profile, subprofile);

    // Aprovar a troca já ativa o novo papel (isTeacherActive /
    // isPresenterActive), como faria a aprovação de um cadastro novo.
    const derivedFields = UserFieldCalculator.calculateDerivedFields(
      profile,
      user.level,
      {},
    );

    const updatedUser = await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        ...derivedFields,
        profile,
        subprofile,
        requestedProfile: null,
        requestedSubprofile: null,
        profileRequestedAt: null,
        updatedBy: adminEmail,
      },
    });

    return new ResponseUserDto(updatedUser);
  }

  async rejectProfileChange(userId: string): Promise<ResponseUserDto> {
    await this.findPendingRequestOrFail(userId);
    const updatedUser = await this.clearRequest(userId);
    return new ResponseUserDto(updatedUser);
  }

  private async findUserOrFail(userId: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  private async findPendingRequestOrFail(userId: string): Promise<UserAccount> {
    const user = await this.findUserOrFail(userId);

    if (!user.requestedProfile) {
      throw new NotFoundException(
        'Nenhuma solicitação de troca de perfil pendente.',
      );
    }

    return user;
  }

  private clearRequest(userId: string): Promise<UserAccount> {
    return this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        requestedProfile: null,
        requestedSubprofile: null,
        profileRequestedAt: null,
      },
    });
  }

  /** Mesma regra do cadastro: só ouvinte "Outro" pode ter e-mail externo. */
  private validateEmailForProfile(
    email: string,
    profile: Profile,
    subprofile: Subprofile | null,
  ): void {
    const requiresUfbaEmail =
      profile !== Profile.Listener || subprofile !== Subprofile.Other;

    if (requiresUfbaEmail && !email.toLowerCase().endsWith('@ufba.br')) {
      throw new BadRequestException(
        'O perfil solicitado exige um e-mail @ufba.br.',
      );
    }
  }

  private profileLabel(
    profile: Profile,
    subprofile?: Subprofile | null,
  ): string {
    const label = PROFILE_LABELS[profile];
    return profile === Profile.Listener && subprofile
      ? `${label} (${SUBPROFILE_LABELS[subprofile]})`
      : label;
  }

  /** Avisa os administradores ativos. Nunca lança. */
  private async notifyAdmins(user: UserAccount): Promise<void> {
    try {
      const admins = await this.prismaClient.userAccount.findMany({
        where: { level: UserLevel.Admin, isActive: true },
        select: { email: true },
      });
      const adminEmails = (admins ?? []).map((admin) => admin.email);

      if (adminEmails.length === 0) {
        this.logger.warn(
          `Nenhum administrador ativo para avisar sobre troca de perfil (userId: ${user.id}).`,
        );
        return;
      }

      await this.mailingService.sendProfileChangeRequestEmail(adminEmails, {
        name: user.name,
        email: user.email,
        currentProfileLabel: this.profileLabel(user.profile, user.subprofile),
        requestedProfileLabel: this.profileLabel(
          user.requestedProfile!,
          user.requestedSubprofile,
        ),
      });
    } catch {
      this.logger.warn(
        `Falha ao avisar administradores sobre troca de perfil (userId: ${user.id}).`,
      );
    }
  }
}
