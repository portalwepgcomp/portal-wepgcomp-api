import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import {
  ContactRequestDto,
  ContactResponseDto,
  DefaultEmailDto,
  DefaultEmailResponseDto,
} from './mailing.dto';
import { EventEditionService } from '../event-edition/event-edition.service';
import { CommitteeMemberService } from '../committee-member/committee-member.service';
import { AppException } from '../exceptions/app.exception';

function applyEmailTemplate(subject: string, htmlContent: string): string {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px">
      <div style="max-width: 600px; margin: auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1)">
        <div style="background-color: #007bff; padding: 20px; color: white">
          <h2 style="margin: 0">${subject}</h2>
        </div>
        <div style="padding: 20px; color: #333">
          ${htmlContent}
        </div>
        <div style="padding: 15px 20px; background-color: #f9f9f9; font-size: 12px; color: #777">
          Este é um email automático do sistema WEPGCOMP
        </div>
      </div>
    </div>
  `;
}

@Injectable()
export class MailingService {
  private readonly transporter: nodemailer.Transporter;
  constructor(
    private eventEditionService: EventEditionService,
    private committeeMemberService: CommitteeMemberService,
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
        html: applyEmailTemplate(defaultEmailDto.subject, defaultEmailDto.html || defaultEmailDto.text),
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
      html: applyEmailTemplate('Contato: WEPGCOMP', htmlContent),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { message: 'Email sent successfully' };
    } catch (error: any) {
      console.error('Nodemailer contact error:', error);
      throw new AppException(`Erro no envio de email: ${error.message}`, 500);
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
      html: applyEmailTemplate('Confirmação de Cadastro', htmlContent),
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
}
