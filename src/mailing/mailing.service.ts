import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MailingService {
  private readonly transporter: nodemailer.Transporter;
  constructor(
    private eventEditionService: EventEditionService,
    private committeeMemberService: CommitteeMemberService,
    private prismaClient: PrismaService,
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
  ): Promise<DefaultEmailResponseDto> {
    try {
      const mailOptions = {
        to: defaultEmailDto.to,
        from: defaultEmailDto.from || process.env.SMTP_FROM_EMAIL,
        subject: defaultEmailDto.subject,
        text: defaultEmailDto.text,
        html: this.buildEmailTemplate(
          defaultEmailDto.html || defaultEmailDto.text,
        ),
      };

      await this.transporter.sendMail(mailOptions);
      return { message: 'Email sent successfully' };
    } catch (error: any) {
      console.error('Nodemailer error:', error);
      throw new AppException(`Erro no envio de email: ${error.message}`, 500);
    }
  }

  async contact(contactDto: ContactRequestDto): Promise<ContactResponseDto> {
    const { name, email, text } = contactDto;

    const eventEdition = await this.eventEditionService.findActive();
    const coordinator =
      await this.committeeMemberService.findCurrentCoordinator(eventEdition.id);

    const htmlContent = `
      <p><strong>Nome:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensagem:</strong></p>
      <p>${text.replace(/\n/g, '<br>')}</p>
    `;

    const mailOptions = {
      to: coordinator.userEmail,
      from: process.env.SMTP_FROM_EMAIL,
      replyTo: email,
      subject: 'Contato: WEPGCOMP',
      text: `Nome: ${name}\nEmail: ${email}\n\nMensagem:\n${text}`,
      html: this.buildEmailTemplate(htmlContent),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { message: 'Email sent successfully' };
    } catch (error: any) {
      console.error('Nodemailer contact error:', error);
      throw new AppException(`Erro no envio de email: ${error.message}`, 500);
    }
  }

  async sendProfessorWelcomeEmail(
    professorEmail: string,
    professorName: string,
    adminName: string,
    temporaryPassword: string,
  ): Promise<void> {
    const htmlContent = `
      <h2>Bem-vindo ao Sistema WEPGCOMP!</h2>
      <p>Olá <strong>${professorName}</strong>,</p>
      <p>Seu cadastro foi criado no sistema WEPGCOMP - Portal do Workshop de Estudantes de Pós-graduação em Ciência da Computação por ${adminName} (Super Administrador).</p>
      <p><strong>Suas credenciais de acesso:</strong></p>
      <p><strong>Email:</strong> ${professorEmail}</p>
      <p><strong>Senha temporária:</strong> ${temporaryPassword}</p>
      <p><strong>Importante:</strong> Recomendamos que você altere sua senha no primeiro acesso através do seu perfil por motivos de segurança.</p>
      <p>Para acessar o sistema, faça login com seu email e a senha temporária fornecida acima.</p>
      <p>Se você tiver alguma dúvida, entre em contato com o administrador do sistema.</p>
    `;

    const mailOptions = {
      to: professorEmail,
      from: process.env.SMTP_FROM_EMAIL,
      subject: 'Bem-vindo ao WEPGCOMP - Credenciais de Acesso',
      html: this.buildEmailTemplate(htmlContent),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error: any) {
      console.error('Nodemailer professor welcome error:', error);
    }
  }

  async sendEmailConfirmation(email: string, token: string): Promise<void> {
    const confirmationUrl = `${process.env.FRONTEND_URL}/users/confirm-email?token=${token}`;

    const htmlContent = `
      <h2>Confirmação de Cadastro</h2>
      <p>Clique no link abaixo para confirmar seu cadastro:</p>
      <p><a href="${confirmationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Confirmar Cadastro</a></p>
      <p>Ou copie e cole este link no seu navegador:</p>
      <p>${confirmationUrl}</p>
    `;

    const mailOptions = {
      to: email,
      from: process.env.SMTP_FROM_EMAIL,
      subject: 'Confirmação de Cadastro',
      html: this.buildEmailTemplate(htmlContent),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error: any) {
      console.error('Nodemailer confirmation error:', error);
      throw new AppException(
        `Erro ao enviar email de confirmação: ${error.message}`,
        500,
      );
    }
  }


  async sendGroupEmail(sendGroupEmailDto: SendGroupEmailDto) {
    const { subject, message, filters } = sendGroupEmailDto;

    try {
      const whereClause: any = {
        isActive: true,
      };

      if (filters.roles && filters.roles.length > 0) {
        whereClause.level = filters.roles.length === 1
          ? filters.roles[0]
          : { in: filters.roles };
      }

      if (filters.profiles && filters.profiles.length > 0) {
        whereClause.profile = filters.profiles.length === 1
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
            html: this.buildEmailTemplate(message),
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
        message: `Email enviado para ${sentCount} destinatário(s)${failedCount > 0 ? `. ${failedCount} falha(s)` : ''
          }`,
      };
    } catch (error) {
      throw error;
    }
  }

  private buildEmailTemplate(message: string): string {
    const sanitizedMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');

    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .email-container {
            background-color: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: #134252;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 30px;
          }
          .message {
            background-color: #f9f9f9;
            padding: 20px;
            border-radius: 4px;
            border-left: 4px solid #134252;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #eee;
          }
          .footer p {
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Portal WePGCOMP</h1>
          </div>
          <div class="content">
            <div class="message">
              ${sanitizedMessage}
            </div>
          </div>
          <div class="footer">
            <p>Esta é uma mensagem automática do Portal WePGCOMP</p>
            <p>Por favor, não responda a este e-mail</p>
          </div>
        </div>
      </body>
    </html>
  `;
  }


}
