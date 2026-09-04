import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { CommitteeMemberService } from '../committee-member/committee-member.service';
import { EventEditionService } from '../event-edition/event-edition.service';
import { AppException } from '../exceptions/app.exception';
import {
  ContactRequestDto,
  ContactResponseDto,
  DefaultEmailDto,
  DefaultEmailResponseDto,
  SendGroupEmailDto,
} from './mailing.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MailingTemplateService } from './mailing-template.service';

@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly eventEditionService: EventEditionService,
    private readonly committeeMemberService: CommitteeMemberService,
    private readonly prismaClient: PrismaService,
    private readonly templateService: MailingTemplateService,
  ) {
    // Nodemailer transporter setup
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmail(
    defaultEmailDto: DefaultEmailDto,
    esqueciSenha?: boolean,
  ): Promise<DefaultEmailResponseDto> {
    try {
      const mailOptions = {
        to: defaultEmailDto.to,
        from: defaultEmailDto.from || process.env.SMTP_FROM_EMAIL,
        subject: defaultEmailDto.subject,
        text: defaultEmailDto.text,
        html: !esqueciSenha
          ? this.templateService.buildEmailTemplate(
              defaultEmailDto.html || defaultEmailDto.text || '',
            )
          : this.templateService.buildEmailTemplateEsqueciASenha(
              defaultEmailDto.html || '',
            ),
      };

      await this.transporter.sendMail(mailOptions);
      return { message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error('Falha ao enviar email', (error as Error)?.stack);
      throw new AppException('Erro no envio de email.', 500);
    }
  }

  async contact(contactDto: ContactRequestDto): Promise<ContactResponseDto> {
    const { name, email, text } = contactDto;

    const eventEdition = await this.eventEditionService.findActive();
    const coordinator =
      await this.committeeMemberService.findCurrentCoordinator(eventEdition.id);

    const mailOptions = {
      to: coordinator.userEmail,
      from: process.env.SMTP_FROM_EMAIL,
      replyTo: email,
      subject: 'Contato: WEPGCOMP',
      text: `Nome: ${name}\nEmail: ${email}\n\nMensagem:\n${text}`,
      html: this.templateService.buildContactHtml(name, email, text),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error(
        'Falha ao enviar email de contato',
        (error as Error)?.stack,
      );
      throw new AppException('Erro no envio de email.', 500);
    }
  }

  async sendProfessorWelcomeEmail(
    professorEmail: string,
    professorName: string,
    adminName: string,
    temporaryPassword: string,
  ): Promise<void> {
    const mailOptions = {
      to: professorEmail,
      from: process.env.SMTP_FROM_EMAIL,
      subject: 'Bem-vindo ao WEPGCOMP - Credenciais de Acesso',
      html: this.templateService.buildProfessorWelcomeHtml(
        professorName,
        professorEmail,
        adminName,
        temporaryPassword,
      ),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(
        'Falha ao enviar email de boas-vindas ao professor',
        (error as Error)?.stack,
      );
    }
  }

  async sendEmailConfirmation(email: string, token: string): Promise<void> {
    const confirmationUrl = `${process.env.FRONTEND_URL}/users/confirm-email?token=${token}`;

    const mailOptions = {
      to: email,
      from: process.env.SMTP_FROM_EMAIL,
      subject: 'Confirmação de Cadastro',
      html: this.templateService.buildEmailConfirmationHtml(confirmationUrl),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(
        'Falha ao enviar email de confirmação',
        (error as Error)?.stack,
      );
      throw new AppException('Erro ao enviar email de confirmação.', 500);
    }
  }

  async sendGroupEmail(sendGroupEmailDto: SendGroupEmailDto) {
    const { subject, message, filters } = sendGroupEmailDto;

    try {
      const whereClause: any = {
        isActive: true,
      };

      if (filters.roles && filters.roles.length > 0) {
        whereClause.level =
          filters.roles.length === 1 ? filters.roles[0] : { in: filters.roles };
      }

      if (filters.profiles && filters.profiles.length > 0) {
        whereClause.profile =
          filters.profiles.length === 1
            ? filters.profiles[0]
            : { in: filters.profiles };
      }

      const users = await this.prismaClient.userAccount.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      if (users.length === 0) {
        throw new BadRequestException(
          'Nenhum usuário encontrado com os filtros especificados',
        );
      }

      const emails = users
        .map((user) => user.email)
        .filter((email) => email && email.trim() !== '');

      if (emails.length === 0) {
        throw new BadRequestException('Nenhum email válido encontrado');
      }

      let sentCount = 0;
      let failedCount = 0;
      const batchSize = 50;

      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);

        try {
          await this.transporter.sendMail({
            from: process.env.SMTP_FROM_EMAIL,
            bcc: batch,
            subject: subject,
            html: this.templateService.buildEmailTemplate(message),
            text: message,
          });

          sentCount += batch.length;
        } catch (error) {
          failedCount += batch.length;
        }
      }

      return {
        success: true,
        sentCount,
        failedCount,
        message: `Email enviado para ${sentCount} destinatário(s)${
          failedCount > 0 ? `. ${failedCount} falha(s)` : ''
        }`,
      };
    } catch (error) {
      throw error;
    }
  }
}
