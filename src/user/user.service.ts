import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Profile,
  RegistrationNumberType,
  UserAccount,
  UserLevel,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProfessorByAdminDto,
  CreateUserDto,
} from './dto/create-user.dto';
import { ResponseUpdatedUserDto } from './dto/response-updated-user.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserAdminService } from './user-admin.service';
import { UserVerificationService } from './user-verification.service';
import { PaginatedResponseDto } from '../shared/dto/paginated-response.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly verificationService: UserVerificationService,
    private readonly adminService: UserAdminService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const registrationOpen = process.env.REGISTRATION_OPEN === 'true';
    if (!registrationOpen) {
      throw new BadRequestException('Período de inscrições encerrado.');
    }

    if (
      createUserDto.profile === Profile.Presenter ||
      createUserDto.profile === Profile.Professor ||
      (createUserDto.profile === Profile.Listener &&
        createUserDto.subprofile !== 'Other')
    ) {
      if (!createUserDto.email.toLowerCase().endsWith('@ufba.br')) {
        throw new BadRequestException(
          'Apenas e-mails @ufba.br podem ser cadastrados.',
        );
      }
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(createUserDto.password)) {
      throw new BadRequestException(
        'A senha deve conter pelo menos 8 caracteres, incluindo pelo menos uma letra, um número e pode conter caracteres especiais.',
      );
    }

    const registrationNumber =
      createUserDto.registrationNumber?.trim() || undefined;

    const registrationNumberType =
      createUserDto.registrationNumberType ??
      (registrationNumber
        ? createUserDto.profile === Profile.Listener
          ? createUserDto.subprofile === 'Other'
            ? RegistrationNumberType.CPF
            : RegistrationNumberType.MATRICULA
          : RegistrationNumberType.MATRICULA
        : undefined);

    if (createUserDto.profile !== Profile.Listener && !registrationNumber) {
      throw new BadRequestException(
        'O número de matrícula é obrigatório para estudantes de doutorado e professores.',
      );
    }

    if (registrationNumber) {
      const exists = await this.prismaClient.userAccount.findFirst({
        where: { registrationNumber },
        select: { id: true },
      });
      if (exists) {
        throw new BadRequestException(
          'Um usuário com essa matrícula já existe.',
        );
      }
    }

    const emailExists = await this.prismaClient.userAccount.findUnique({
      where: { email: createUserDto.email },
      select: { id: true },
    });
    if (emailExists) {
      throw new BadRequestException('Um usuário com esse email já existe.');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const shouldBeSuperAdmin =
      createUserDto.profile === Profile.Professor
        ? await this.checkProfessorShouldBeSuperAdmin()
        : false;

    let lattesPhotoPath: string | undefined = undefined;
    const linkLattes = createUserDto.linkLattes;

    if (linkLattes) {
      try {
        lattesPhotoPath =
          await this.adminService.getLattesPhotoPath(linkLattes);
      } catch {
        this.logger.warn(
          'Falha ao buscar foto do Lattes no cadastro. Usuário será criado sem photoPath.',
        );
      }
    }

    const user = await this.prismaClient.userAccount.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hashedPassword,
        subprofile: createUserDto.subprofile ?? null,
        level: shouldBeSuperAdmin ? UserLevel.Superadmin : UserLevel.Default,
        registrationNumber,
        registrationNumberType,
        isActive: true,
        isTeacherActive:
          createUserDto.profile === Profile.Professor && !shouldBeSuperAdmin
            ? false
            : true,
        isPresenterActive:
          createUserDto.profile === Profile.Presenter ? false : true,
        photoFilePath: lattesPhotoPath,
        profile: createUserDto.profile ?? Profile.Listener,
        linkLattes: linkLattes,
      },
    });

    if (!user.isVerified) {
      await this.verificationService.createAndSendVerification(user);
    }

    return new ResponseUserDto(user);
  }

  async createProfessorByAdmin(
    createProfessorDto: CreateProfessorByAdminDto,
    adminUserId: string,
  ): Promise<{ user: ResponseUserDto; emailSent: boolean }> {
    return this.adminService.createProfessorByAdmin(
      createProfessorDto,
      adminUserId,
    );
  }

  async findByEmail(email: string) {
    return this.prismaClient.userAccount.findUnique({
      where: {
        email,
      },
    });
  }

  async checkProfessorShouldBeSuperAdmin(): Promise<boolean> {
    const professorsCount = await this.prismaClient.userAccount.count({
      where: {
        profile: Profile.Professor,
      },
    });

    return professorsCount === 0;
  }

  async remove(id: string) {
    const userExists = await this.prismaClient.userAccount.findUnique({
      where: {
        id,
      },
    });

    if (!userExists) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    await this.prismaClient.userAccount.delete({
      where: {
        id,
      },
    });

    return { message: 'Cadastro de Usuário removido com sucesso.' };
  }

  async toggleUserActivation(userId: string, activated: boolean) {
    return this.adminService.toggleUserActivation(userId, activated);
  }

  isAdmin(user: UserAccount): boolean {
    return ['Admin', 'Superadmin'].includes(user.level);
  }

  /**
   * Lista usuários com suporte a busca, filtros por papéis/perfis e paginação por envelope (P3.2).
   */
  async findAll(
    roles?: string | string[],
    profiles?: string | string[],
    status?: string,
    search?: string,
    page?: number,
    pageSize?: number,
    paginated?: false,
  ): Promise<ResponseUserDto[]>;
  async findAll(
    roles?: string | string[],
    profiles?: string | string[],
    status?: string,
    search?: string,
    page?: number,
    pageSize?: number,
    paginated?: true,
  ): Promise<PaginatedResponseDto<ResponseUserDto>>;
  async findAll(
    roles?: string | string[],
    profiles?: string | string[],
    status?: string,
    search?: string,
    page?: number,
    pageSize?: number,
    paginated?: boolean,
  ): Promise<ResponseUserDto[] | PaginatedResponseDto<ResponseUserDto>>;
  async findAll(
    roles?: string | string[],
    profiles?: string | string[],
    status?: string,
    search?: string,
    page?: number,
    pageSize?: number,
    paginated?: boolean,
  ): Promise<ResponseUserDto[] | PaginatedResponseDto<ResponseUserDto>> {
    const whereClause: any = {};
    if (roles && Array.isArray(roles)) {
      whereClause.level = { in: roles as UserLevel[] };
    } else if (roles && typeof roles === 'string') {
      whereClause.level = roles as UserLevel;
    }

    if (profiles && Array.isArray(profiles)) {
      whereClause.profile = { in: profiles as Profile[] };
    } else if (profiles && typeof profiles === 'string') {
      whereClause.profile = profiles as Profile;
    }

    if (status) {
      whereClause.isActive = status === 'Active';
    }

    const searchTerm = typeof search === 'string' ? search.trim() : '';
    if (searchTerm) {
      whereClause.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const total =
      typeof this.prismaClient.userAccount?.count === 'function'
        ? await this.prismaClient.userAccount.count({ where: whereClause })
        : 0;

    const isPaginatedRequested = paginated === true || (page !== undefined && pageSize !== undefined);
    const currentPage = page && page > 0 ? page : 1;
    const limit = pageSize && pageSize > 0 ? pageSize : 20;
    const skip = isPaginatedRequested ? (currentPage - 1) * limit : undefined;
    const take = isPaginatedRequested ? limit : undefined;

    const users = await this.prismaClient.userAccount.findMany({
      where: whereClause,
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        registrationNumber: true,
        registrationNumberType: true,
        linkLattes: true,
        photoFilePath: true,
        profile: true,
        level: true,
        isVerified: true,
        isActive: true,
        isTeacherActive: true,
        isPresenterActive: true,
        isAdmin: true,
        isSuperadmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const userIds = users.map((u) => u.id);

    const submissions = await this.prismaClient.submission.findMany({
      where: { mainAuthorId: { in: userIds } },
      select: { mainAuthorId: true },
    });

    const usersWithSubmission = new Set(submissions.map((s) => s.mainAuthorId));

    const items = users.map((user) => ({
      ...new ResponseUserDto(user as any),
      hasSubmission: usersWithSubmission.has(user.id),
    }));

    if (paginated) {
      return PaginatedResponseDto.create(items, total, currentPage, limit);
    }

    return items;
  }

  async confirmEmail(token: string): Promise<boolean> {
    return this.verificationService.confirmEmail(token);
  }

  async updateRegistrationNumber(
    userId: string,
    registrationNumber: string | null,
  ): Promise<void> {
    await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: { registrationNumber },
    });
  }

  async approveTeacher(id: string): Promise<UserAccount> {
    return this.adminService.approveTeacher(id);
  }

  async approvePresenter(id: string): Promise<UserAccount> {
    return this.adminService.approvePresenter(id);
  }

  async editUserBySuperAdmin(
    email: string,
    updateUserDto: UpdateUserDto,
    superadminEmail: string,
  ): Promise<ResponseUpdatedUserDto> {
    return this.adminService.editUserBySuperAdmin(
      email,
      updateUserDto,
      superadminEmail,
    );
  }

  public async findById(userId: string) {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado.`);
    }

    return user;
  }
}
