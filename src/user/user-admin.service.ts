import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { URL } from 'url';
import * as bcrypt from 'bcrypt';
import {
  Profile,
  RegistrationNumberType,
  UserAccount,
  UserLevel,
} from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateRandomPassword } from '../utils/password.util';
import { CreateProfessorByAdminDto } from './dto/create-user.dto';
import { ResponseUpdatedUserDto } from './dto/response-updated-user.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFieldCalculator } from './utils/user-field-calculator';

@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly mailingService: MailingService,
    private readonly httpService: HttpService,
  ) {}

  async createProfessorByAdmin(
    createProfessorDto: CreateProfessorByAdminDto,
    adminUserId: string,
  ): Promise<{ user: ResponseUserDto; emailSent: boolean }> {
    const adminUser = await this.prismaClient.userAccount.findUnique({
      where: { id: adminUserId },
      select: { id: true, name: true, level: true },
    });

    if (!adminUser || adminUser.level !== UserLevel.Admin) {
      throw new AppException(
        'Apenas administradores podem criar professores.',
        403,
      );
    }

    if (!createProfessorDto.email.toLowerCase().endsWith('@ufba.br')) {
      throw new BadRequestException(
        'Apenas e-mails @ufba.br podem ser cadastrados para professores.',
      );
    }

    const emailExists = await this.prismaClient.userAccount.findUnique({
      where: { email: createProfessorDto.email },
      select: { id: true },
    });
    if (emailExists) {
      throw new BadRequestException('Um usuário com esse email já existe.');
    }

    const registrationExists = await this.prismaClient.userAccount.findFirst({
      where: { registrationNumber: createProfessorDto.registrationNumber },
      select: { id: true },
    });
    if (registrationExists) {
      throw new BadRequestException('Um usuário com essa matrícula já existe.');
    }

    const temporaryPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const user = await this.prismaClient.userAccount.create({
      data: {
        name: createProfessorDto.name,
        email: createProfessorDto.email,
        password: hashedPassword,
        profile: Profile.Professor,
        level: UserLevel.Default,
        registrationNumber: createProfessorDto.registrationNumber,
        registrationNumberType:
          createProfessorDto.registrationNumberType ??
          RegistrationNumberType.MATRICULA,
        photoFilePath: createProfessorDto.photoFilePath,
        isActive: true,
        isVerified: true,
      },
    });

    let emailSent = false;
    try {
      await this.mailingService.sendProfessorWelcomeEmail(
        user.email,
        user.name,
        adminUser.name,
        temporaryPassword,
      );
      emailSent = true;
    } catch {
      this.logger.warn(
        `Falha ao enviar e-mail de boas-vindas (userId: ${user.id}).`,
      );
    }

    return {
      user: new ResponseUserDto(user),
      emailSent,
    };
  }

  async approveTeacher(id: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.profile !== Profile.Professor) {
      throw new BadRequestException('Apenas professores podem ser aprovados.');
    }

    return this.prismaClient.userAccount.update({
      where: { id },
      data: { isTeacherActive: true },
    });
  }

  async approvePresenter(id: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (user.profile !== Profile.Presenter) {
      throw new BadRequestException(
        'Apenas apresentadores podem ser aprovados.',
      );
    }

    return this.prismaClient.userAccount.update({
      where: { id },
      data: { isPresenterActive: true },
    });
  }

  async toggleUserActivation(
    userId: string,
    activated: boolean,
  ): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppException('Usuário não encontrado', 404);
    }

    if (activated && user.isActive) {
      throw new AppException('O usuário já está ativo', 409);
    }

    if (!activated && !user.isActive) {
      throw new AppException('O usuário já está desativado', 409);
    }

    const newStatus = activated ? true : false;

    return this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        isActive: newStatus,
      },
    });
  }

  async editUserByAdmin(
    email: string,
    updateUserDto: UpdateUserDto,
    adminEmail: string,
  ): Promise<ResponseUpdatedUserDto> {
    const decodedEmail = decodeURIComponent(email);

    const existingUser = await this.findUserByEmailOrFail(decodedEmail);

    await this.validateEmailRules(updateUserDto, existingUser);
    await this.validateBusinessRules(decodedEmail, updateUserDto, existingUser);

    const processedData = this.processUpdateData(updateUserDto, existingUser);
    processedData.updatedBy = adminEmail;

    let photoPathToUpdate: string | null | undefined = undefined;

    if ('linkLattes' in updateUserDto) {
      const newLinkLattes = updateUserDto.linkLattes;

      if (newLinkLattes) {
        try {
          photoPathToUpdate = await this.getLattesPhotoPath(newLinkLattes);
        } catch {
          this.logger.warn(
            'Falha ao atualizar foto do Lattes. Photo Path será removido.',
          );
          photoPathToUpdate = null;
        }
      } else {
        photoPathToUpdate = null;
      }
    }

    if (photoPathToUpdate !== undefined) {
      processedData.photoFilePath = photoPathToUpdate;
    }

    const updatedUser = await this.updateUser(decodedEmail, processedData);

    return new ResponseUpdatedUserDto(updatedUser);
  }

  private async findUserByEmailOrFail(email: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  private async validateEmailRules(
    updateData: UpdateUserDto,
    existingUser: UserAccount,
  ): Promise<void> {
    if (updateData.email && updateData.email !== existingUser.email) {
      const finalProfile = updateData.profile ?? existingUser.profile;

      if (finalProfile !== Profile.Listener) {
        if (!updateData.email.toLowerCase().endsWith('@ufba.br')) {
          throw new BadRequestException(
            'Apenas usuários com perfil "Listener" podem ter email diferente de @ufba.br.',
          );
        }
      }

      const emailExists = await this.prismaClient.userAccount.findUnique({
        where: { email: updateData.email },
        select: { id: true },
      });

      if (emailExists) {
        throw new BadRequestException(
          'Este email já está em uso por outro usuário.',
        );
      }
    }
  }

  private async validateBusinessRules(
    email: string,
    updateData: UpdateUserDto,
    existingUser: UserAccount,
  ): Promise<void> {
    await this.validateRegistrationNumberUniqueness(updateData, existingUser);

    if (updateData.profile) {
      const emailToValidate = updateData.email ?? email;
      this.validateProfileEmailRequirements(
        emailToValidate,
        updateData.profile,
      );
    }

    if (updateData.level && updateData.level !== UserLevel.Admin) {
      const isAdmin = existingUser.level === UserLevel.Admin;
      if (isAdmin) {
        const adminCount = await this.prismaClient.userAccount.count({
          where: { level: UserLevel.Admin },
        });

        if (adminCount <= 1) {
          throw new BadRequestException(
            'Não é possível rebaixar o último administrador do sistema.',
          );
        }
      }
    }
  }

  private processUpdateData(
    updateData: UpdateUserDto,
    existingUser: UserAccount,
  ): any {
    const cleanData = this.removeUndefinedFields(updateData);
    const derivedFields = UserFieldCalculator.calculateDerivedFields(
      updateData.profile ?? existingUser.profile,
      updateData.level ?? existingUser.level,
      updateData,
    );

    return { ...cleanData, ...derivedFields };
  }

  private async updateUser(email: string, data: any): Promise<UserAccount> {
    return this.prismaClient.userAccount.update({
      where: { email },
      data,
    });
  }

  private async validateRegistrationNumberUniqueness(
    updateData: UpdateUserDto,
    existingUser: UserAccount,
  ): Promise<void> {
    if (
      !updateData.registrationNumber ||
      updateData.registrationNumber === existingUser.registrationNumber
    ) {
      return;
    }

    const exists = await this.prismaClient.userAccount.findFirst({
      where: {
        registrationNumber: updateData.registrationNumber,
        id: { not: existingUser.id },
      },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Um usuário com essa matrícula já existe.');
    }
  }

  private validateProfileEmailRequirements(
    email: string,
    profile?: Profile,
  ): void {
    if (profile && profile !== Profile.Listener) {
      if (!email.toLowerCase().endsWith('@ufba.br')) {
        throw new BadRequestException(`${profile} deve ter um email @ufba.br`);
      }
    }
  }

  private removeUndefinedFields(data: any): any {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
  }

  async getLattesPhotoPath(linkLattes: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(linkLattes, {
          timeout: 7000,
        }),
      );
      const idUrl = (response as any).request.res.responseUrl;

      if (!idUrl || !idUrl.includes('buscatextual.cnpq.br')) {
        throw new Error(
          'Não foi possível obter a URL final do Lattes ou a URL é inesperada.',
        );
      }

      const parsedUrl = new URL(idUrl);
      const id = parsedUrl.searchParams.get('id');

      if (!id) {
        throw new Error('Parâmetro "id" não encontrado na URL final.');
      }

      return `https://servicosweb.cnpq.br/wspessoa/servletrecuperafoto?tipo=1&id=${id}`;
    } catch {
      this.logger.error('Erro ao buscar foto do Lattes.');
      throw new BadRequestException(
        `Não foi possível processar o Lattes ID numérico: ${linkLattes}. Verifique o ID e tente novamente.`,
      );
    }
  }
}
