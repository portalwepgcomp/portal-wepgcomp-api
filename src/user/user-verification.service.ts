import { Injectable, Logger } from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Profile, UserAccount, UserLevel } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserVerificationService {
  private readonly logger = new Logger(UserVerificationService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailingService: MailingService,
  ) {}

  async generateEmailToken(userId: string): Promise<string> {
    const payload = { id: userId };
    return this.jwtService.sign(payload, { expiresIn: '24h' });
  }

  async isTokenUsed(token: string): Promise<boolean> {
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

  async createAndSendVerification(user: {
    id: string;
    email: string;
  }): Promise<void> {
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
    } catch {
      this.logger.warn(
        `Falha ao enviar e-mail de confirmação (userId: ${user.id}).`,
      );
    }
  }

  /**
   * Apresentadores e professores nascem pendentes de aprovação. Depois que o
   * e-mail é confirmado, avisa os administradores ativos. Nunca lança.
   */
  private async notifyAdminsOfPendingApproval(
    user: UserAccount,
  ): Promise<void> {
    const needsApproval =
      (user.profile === Profile.Presenter && !user.isPresenterActive) ||
      (user.profile === Profile.Professor && !user.isTeacherActive);

    if (!needsApproval) return;

    try {
      const admins = await this.prismaClient.userAccount.findMany({
        where: { level: UserLevel.Admin, isActive: true },
        select: { email: true },
      });
      const adminEmails = (admins ?? []).map((admin) => admin.email);

      if (adminEmails.length === 0) {
        this.logger.warn(
          `Nenhum administrador ativo para avisar sobre aprovação pendente (userId: ${user.id}).`,
        );
        return;
      }

      await this.mailingService.sendApprovalRequestEmail(adminEmails, {
        name: user.name,
        email: user.email,
        profile: user.profile,
        registrationNumber: user.registrationNumber,
      });
    } catch {
      this.logger.warn(
        `Falha ao avisar administradores sobre aprovação pendente (userId: ${user.id}).`,
      );
    }
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

      if (user) {
        // Não bloqueia a resposta da confirmação; erros são tratados internamente.
        void this.notifyAdminsOfPendingApproval(user);
      }

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
}
