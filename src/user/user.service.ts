import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateUserDto,
  CreateProfessorByAdminDto,
  RegistrationNumberType,
  Profile,
  UserLevel,
  SetAdminDto,
} from './dto/create-user.dto';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Prisma, UserAccount } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResponseUserDto } from './dto/response-user.dto';
import { generateRandomPassword } from '../utils/password.util';

@Injectable()
export class UserService {
  constructor(
    private prismaClient: PrismaService,
    private jwtService: JwtService,
    private mailingService: MailingService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    // Validacao de e-mail @ufba.br para quem nao eh de fora.
    if (createUserDto.profile !== Profile.Listener) {
      if (!createUserDto.email.toLowerCase().endsWith('@ufba.br')) {
        throw new BadRequestException(
          'Apenas e-mails @ufba.br podem ser cadastrados.',
        );
      }
    }

    // Validacao da senha mín 8, 1 letra, 1 número
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(createUserDto.password)) {
      throw new BadRequestException(
        'A senha deve conter pelo menos 8 caracteres, incluindo pelo menos uma letra, um número e pode conter caracteres especiais.',
      );
    }

    // normaliza string vazia
    const registrationNumber =
      createUserDto.registrationNumber?.trim() || undefined;

    // define tipo padrão se vier número e não informar tipo:
    const registrationNumberType =
      createUserDto.registrationNumberType ??
      (registrationNumber
        ? createUserDto.profile === Profile.Listener
          ? RegistrationNumberType.CPF
          : RegistrationNumberType.MATRICULA
        : undefined);

    // ouvintes podem não enviar matrícula/CPF; demais perfis exigem número
    if (createUserDto.profile !== Profile.Listener && !registrationNumber) {
      throw new BadRequestException(
        'O número de matrícula é obrigatório para estudantes de doutorado e professores.',
      );
    }

    // checagem de duplicidade por registration_number (independe do tipo)
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

    // checagem de email duplicado
    const emailExists = await this.prismaClient.userAccount.findUnique({
      where: { email: createUserDto.email },
      select: { id: true },
    });
    if (emailExists) {
      throw new BadRequestException('Um usuário com esse email já existe.');
    }

    // hash e criação
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const shouldBeSuperAdmin =
      createUserDto.profile === Profile.Professor
        ? await this.checkProfessorShouldBeSuperAdmin()
        : false;

    const user = await this.prismaClient.userAccount.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hashedPassword,
        profile: createUserDto.profile ?? Profile.Listener,
        level: shouldBeSuperAdmin ? UserLevel.Superadmin : UserLevel.Default,
        registrationNumber,
        registrationNumberType,
        isActive:
          createUserDto.profile === Profile.Professor && !shouldBeSuperAdmin
            ? false
            : true,
        isTeacherActive:
          createUserDto.profile === Profile.Professor && !shouldBeSuperAdmin
            ? false
            : true,
      },
    });

    // Fluxo de verificação por e-mail
    if (!user.isVerified) {
      const token = await this.generateEmailToken(user.id);
      await this.prismaClient.emailVerification.create({
        data: {
          userId: user.id,
          emailVerificationToken: token,
          emailVerificationSentAt: new Date(),
        },
      });
      try {
        await this.mailingService.sendEmailConfirmation(user.email, token);
      } catch (err) {
        console.warn('Falha ao enviar e-mail de confirmação:', user.email, err);
      }
    }

    return new ResponseUserDto(user);
  }

  async createProfessorByAdmin(
    createProfessorDto: CreateProfessorByAdminDto,
    adminUserId: string,
  ): Promise<{ user: ResponseUserDto; emailSent: boolean }> {
    // Validate admin permissions
    const adminUser = await this.prismaClient.userAccount.findUnique({
      where: { id: adminUserId },
      select: { id: true, name: true, level: true },
    });

    if (!adminUser || adminUser.level !== UserLevel.Superadmin) {
      throw new AppException(
        'Apenas super administradores podem criar professores.',
        403,
      );
    }

    // Validate @ufba.br email
    if (!createProfessorDto.email.toLowerCase().endsWith('@ufba.br')) {
      throw new BadRequestException(
        'Apenas e-mails @ufba.br podem ser cadastrados para professores.',
      );
    }

    // Check for duplicate email
    const emailExists = await this.prismaClient.userAccount.findUnique({
      where: { email: createProfessorDto.email },
      select: { id: true },
    });
    if (emailExists) {
      throw new BadRequestException('Um usuário com esse email já existe.');
    }

    // Check for duplicate registration number
    const registrationExists = await this.prismaClient.userAccount.findFirst({
      where: { registrationNumber: createProfessorDto.registrationNumber },
      select: { id: true },
    });
    if (registrationExists) {
      throw new BadRequestException('Um usuário com essa matrícula já existe.');
    }

    // Generate random password
    const temporaryPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Create professor user
    const user = await this.prismaClient.userAccount.create({
      data: {
        name: createProfessorDto.name,
        email: createProfessorDto.email,
        password: hashedPassword,
        profile: Profile.Professor,
        level: UserLevel.Default, // Professors start as default level
        registrationNumber: createProfessorDto.registrationNumber,
        registrationNumberType:
          createProfessorDto.registrationNumberType ??
          RegistrationNumberType.MATRICULA,
        photoFilePath: createProfessorDto.photoFilePath,
        isActive: true, // Professors created by admin are immediately active
        isVerified: true, // Skip email verification for admin-created users
      },
    });

    // Send welcome email with credentials
    let emailSent = false;
    try {
      await this.mailingService.sendProfessorWelcomeEmail(
        user.email,
        user.name,
        adminUser.name,
        temporaryPassword,
      );
      emailSent = true;
    } catch (err) {
      console.warn('Falha ao enviar e-mail de boas-vindas:', user.email, err);
      // We don't throw here because the user was created successfully
      // The admin should check the emailSent flag and manually share credentials if needed
    }

    return {
      user: new ResponseUserDto(user),
      emailSent, // Indicates whether the email was sent successfully
    };
  }

  async findByEmail(email: string) {
    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        email,
      },
    });

    return user;
  }

  async checkProfessorShouldBeSuperAdmin(): Promise<boolean> {
    const professorsCount = await this.prismaClient.userAccount.count({
      where: {
        profile: Profile.Professor,
      },
    });

    return professorsCount > 0 ? false : true;
  }

  async setDefault(setDefaultDto: SetAdminDto): Promise<ResponseUserDto> {
    const { requestUserId, targetUserId } = setDefaultDto;

    const requestUser = await this.prismaClient.userAccount.findFirst({
      where: {
        id: requestUserId,
      },
    });

    if (!requestUser) {
      throw new AppException('Usuário solicitante não encontrado.', 404);
    }

    if (!this.isAdmin(requestUser)) {
      throw new AppException(
        'O usuário não possui privilégios de administrador ou super administrador.',
        403,
      );
    }

    const targetUser = await this.prismaClient.userAccount.findFirst({
      where: {
        id: targetUserId,
      },
    });

    if (!targetUser) {
      throw new AppException('Usuário-alvo não encontrado.', 404);
    }

    if (
      targetUser.level === UserLevel.Superadmin &&
      requestUser.level === UserLevel.Admin
    ) {
      throw new AppException(
        'Um usuário administrador não tem permissão para rebaixar um super administrador.',
        403,
      );
    }

    const updatedTargetUser = await this.prismaClient.userAccount.update({
      where: {
        id: targetUserId,
      },
      data: {
        level: UserLevel.Default,
      },
    });

    const responseUserDto = new ResponseUserDto(updatedTargetUser);

    return responseUserDto;
  }

  async setAdmin(setAdminDto: SetAdminDto): Promise<ResponseUserDto> {
    const { requestUserId, targetUserId } = setAdminDto;

    const requestUser = await this.prismaClient.userAccount.findFirst({
      where: {
        id: requestUserId,
      },
    });

    if (!requestUser) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    if (!this.isAdmin(requestUser)) {
      throw new AppException(
        'O usuário não possui privilégios de administrador ou super administrador.',
        403,
      );
    }

    try {
      const targetUser = await this.prismaClient.userAccount.update({
        where: {
          id: targetUserId,
        },
        data: {
          level: UserLevel.Admin,
        },
      });

      const responseUserDto = new ResponseUserDto(targetUser);

      return responseUserDto;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new AppException('Usuário-alvo não encontrado', 404);
      }

      throw new Error(e);
    }
  }

  async setSuperAdmin(setAdminDto: SetAdminDto): Promise<ResponseUserDto> {
    const { requestUserId, targetUserId } = setAdminDto;

    const requestUser = await this.prismaClient.userAccount.findFirst({
      where: {
        id: requestUserId,
      },
    });

    if (!requestUser) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    if (requestUser.level !== 'Superadmin') {
      throw new AppException(
        'O usuário não possui privilégios de super administrador.',
        403,
      );
    }

    try {
      const targetUser = await this.prismaClient.userAccount.update({
        where: {
          id: targetUserId,
        },
        data: {
          level: UserLevel.Superadmin,
        },
      });

      const responseUserDto = new ResponseUserDto(targetUser);

      return responseUserDto;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new AppException('Usuário-alvo não encontrado', 404);
      }

      throw new Error(e);
    }
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

    const updatedUser = await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        isActive: newStatus,
      },
    });

    return updatedUser;
  }

  isAdmin(user: UserAccount): boolean {
    return ['Admin', 'Superadmin'].includes(user.level);
  }

  async findAll(
    roles?: string | string[],
    profiles?: string | string[],
    status?: string,
  ): Promise<ResponseUserDto[]> {
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
      whereClause.isActive = status === 'Active' ? true : false;
    }

    const users = await this.prismaClient.userAccount.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        registrationNumber: true,
        registrationNumberType: true,
        photoFilePath: true,
        profile: true,
        level: true,
        isVerified: true,
        isActive: true,
        isTeacherActive: true,
        isAdmin: true,
        isSuperadmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users.map((user) => new ResponseUserDto(user as any));
  }

  private async generateEmailToken(userId: string): Promise<string> {
    const payload = { id: userId };
    return this.jwtService.sign(payload, { expiresIn: '24h' });
  }

  private async isTokenUsed(token: string): Promise<boolean> {
    const tokenRecord = await this.prismaClient.emailVerification.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerifiedAt: {
          not: null,
        },
      },
    });

    return !!tokenRecord;
  }

  async confirmEmail(token: string): Promise<boolean> {
    try {
      const tokenUsed = await this.isTokenUsed(token);
      if (tokenUsed) {
        throw new AppException('Token já utilizado.', 400);
      }
      const { id } = this.jwtService.verify(token);
      const user = await this.prismaClient.$transaction(async (prisma) => {
        const updatedUser = await prisma.userAccount.update({
          where: { id },
          data: { isVerified: true },
        });

        await prisma.emailVerification.update({
          where: { userId: id },
          data: { emailVerifiedAt: new Date() },
        });

        return updatedUser;
      });

      return !!user;
    } catch (error) {
      if (
        error instanceof TokenExpiredError ||
        error instanceof JsonWebTokenError
      ) {
        throw new AppException('Token inválido ou expirado.', 400);
      }
      throw error;
    }
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

  // --- ENHANCED ROLE MANAGEMENT SYSTEM ---

  /**
   * Approves a teacher - sets isTeacherActive to true
   * Only Admin and Superadmin can approve teachers
   */
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
      where: { id: id },
      data: { isTeacherActive: true },
    });
  }

  /**
   * Promotes a user to Admin - sets isAdmin to true and level to Admin
   * Only Superadmin can promote to Admin
   * User must be an approved teacher to become Admin
   */
  async promoteToAdmin(id: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Business rule: Only approved teachers can become admins
    if (user.profile !== Profile.Professor || !user.isTeacherActive) {
      throw new BadRequestException(
        'Apenas professores aprovados podem ser promovidos a administradores.',
      );
    }

    // Business rule: Cannot promote someone who is already an admin or superadmin
    if (user.isAdmin || user.isSuperadmin) {
      throw new BadRequestException('Usuário já possui cargo administrativo.');
    }

    return this.prismaClient.userAccount.update({
      where: { id: id },
      data: {
        isAdmin: true,
        level: UserLevel.Admin,
      },
    });
  }

  /**
   * Promotes a user to Superadmin - sets isSuperadmin to true and level to Superadmin
   * Only existing Superadmin can promote to Superadmin
   * User must be an Admin to become Superadmin
   */
  async promoteToSuperadmin(id: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Business rule: Only Admins can become Superadmins
    if (!user.isAdmin) {
      throw new BadRequestException(
        'Apenas administradores podem ser promovidos a superadministradores.',
      );
    }

    // Business rule: Cannot promote someone who is already a superadmin
    if (user.isSuperadmin) {
      throw new BadRequestException('Usuário já é superadministrador.');
    }

    return this.prismaClient.userAccount.update({
      where: { id: id },
      data: {
        isSuperadmin: true,
        level: UserLevel.Superadmin,
      },
    });
  }

  /**
   * Demotes a user by one level in the hierarchy
   * Hierarchy: Superadmin → Admin → Approved Teacher → Default User
   * Only Superadmin can demote other users
   * Cannot demote the last Superadmin
   */
  async demoteUser(id: string): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Prevent demoting the last superadmin (check both boolean flag and level)
    const isSuperadmin =
      user.isSuperadmin || user.level === UserLevel.Superadmin;
    if (isSuperadmin) {
      const superadminCount = await this.prismaClient.userAccount.count({
        where: {
          OR: [{ isSuperadmin: true }, { level: UserLevel.Superadmin }],
        },
      });

      if (superadminCount <= 1) {
        throw new BadRequestException(
          'Não é possível rebaixar o último superadministrador do sistema.',
        );
      }
    }

    // Determine current role and demotion target
    let updateData: any = {};
    let demotionMessage = '';

    // Check for Admin (either by boolean flag or level)
    const isAdmin = user.isAdmin || user.level === UserLevel.Admin;

    if (isSuperadmin) {
      // Superadmin → Admin (keep admin status)
      updateData = {
        isSuperadmin: false,
        isAdmin: true, // Ensure admin flag is set correctly
        level: UserLevel.Admin,
        // Keep isTeacherActive as is
      };
      demotionMessage = 'Superadministrador rebaixado para Administrador';
    } else if (isAdmin) {
      // Admin → Approved Teacher (if they are a professor) or Default User
      if (user.profile === Profile.Professor) {
        updateData = {
          isAdmin: false,
          level: UserLevel.Default,
          isTeacherActive: true, // Make them approved teacher
        };
        demotionMessage = 'Administrador rebaixado para Professor Aprovado';
      } else {
        // Non-professor admin becomes default user
        updateData = {
          isAdmin: false,
          level: UserLevel.Default,
          isTeacherActive: false, // Non-professors shouldn't have teacher status
        };
        demotionMessage = 'Administrador rebaixado para Usuário Padrão';
      }
    } else if (user.isTeacherActive && user.profile === Profile.Professor) {
      // Approved Teacher → Default User (remove teacher approval)
      updateData = {
        isTeacherActive: false,
        level: UserLevel.Default,
      };
      demotionMessage = 'Professor aprovado rebaixado para Usuário Padrão';
    } else {
      throw new BadRequestException(
        'Usuário já está no nível mais baixo ou não possui cargo para ser rebaixado.',
      );
    }

    const updatedUser = await this.prismaClient.userAccount.update({
      where: { id: id },
      data: updateData,
    });

    // Log the demotion for audit purposes
    console.log(`Demotion: ${demotionMessage} - User ID: ${id}`);

    return updatedUser;
  }

  /**
   * Demotes a user to a specific level (for advanced use cases)
   * Allows skipping levels in the hierarchy
   */
  async demoteUserToLevel(
    id: string,
    targetLevel: 'default' | 'teacher' | 'admin',
  ): Promise<UserAccount> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Prevent demoting the last superadmin unless target is admin
    if (user.isSuperadmin && targetLevel !== 'admin') {
      const superadminCount = await this.prismaClient.userAccount.count({
        where: { isSuperadmin: true },
      });

      if (superadminCount <= 1) {
        throw new BadRequestException(
          'Não é possível rebaixar o último superadministrador para níveis inferiores a administrador.',
        );
      }
    }

    let updateData: any = {};

    switch (targetLevel) {
      case 'default':
        updateData = {
          isSuperadmin: false,
          isAdmin: false,
          isTeacherActive: false,
          level: UserLevel.Default,
        };
        break;
      case 'teacher':
        if (user.profile !== Profile.Professor) {
          throw new BadRequestException(
            'Apenas professores podem ser rebaixados para nível de professor aprovado.',
          );
        }
        updateData = {
          isSuperadmin: false,
          isAdmin: false,
          isTeacherActive: true,
          level: UserLevel.Default,
        };
        break;
      case 'admin':
        updateData = {
          isSuperadmin: false,
          isAdmin: true,
          level: UserLevel.Admin,
          // Keep isTeacherActive as is
        };
        break;
      default:
        throw new BadRequestException('Nível de rebaixamento inválido.');
    }

    return this.prismaClient.userAccount.update({
      where: { id: id },
      data: updateData,
    });
  }
}
