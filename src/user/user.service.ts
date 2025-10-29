import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { UserAccount } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateRandomPassword } from '../utils/password.util';
import {
  CreateProfessorByAdminDto,
  CreateUserDto,
  Profile,
  RegistrationNumberType,
  UserLevel,
} from './dto/create-user.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFieldCalculator } from './utils/user-field-calculator';
import { ResponseUpdatedUserDto } from './dto/response-updated-user.dto';

@Injectable()
export class UserService {
  constructor(
    private prismaClient: PrismaService,
    private jwtService: JwtService,
    private mailingService: MailingService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    // Validacao de e-mail @ufba.br para quem nao eh de fora.
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
          ? createUserDto.subprofile === 'Other'
            ? RegistrationNumberType.CPF
            : RegistrationNumberType.MATRICULA
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

    return users.map((user) => ({
      ...new ResponseUserDto(user as any),
      hasSubmission: usersWithSubmission.has(user.id),
    }));
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
   * Approves a presenter - sets isPresenterActive to true
   * Only Admin and Superadmin can approve presenters
   */
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
      where: { id: id },
      data: { isPresenterActive: true },
    });
  }

  async editUserBySuperAdmin(
    email: string,

    updateUserDto: UpdateUserDto,
    superadminEmail: string,
  ): Promise<ResponseUpdatedUserDto> {
    const decodedEmail = decodeURIComponent(email);

    const existingUser = await this.findUserByEmailOrFail(decodedEmail);

    await this.validateEmailRules(updateUserDto, existingUser);

    await this.validateBusinessRules(decodedEmail, updateUserDto, existingUser);

    const processedData = this.processUpdateData(updateUserDto, existingUser);

    processedData.updatedBy = superadminEmail;

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

    // Prevent demoting the last superadmin
    if (updateData.level && updateData.level !== UserLevel.Superadmin) {
      const isSuperadmin =
        existingUser.isSuperadmin ||
        existingUser.level === UserLevel.Superadmin;
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

  public async findById(userId: string) {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Dispara a exceção 404 Not Found
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado.`);
    }

    return user;
  }
}
