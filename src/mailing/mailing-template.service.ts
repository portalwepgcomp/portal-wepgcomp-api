import { Injectable } from '@nestjs/common';

@Injectable()
export class MailingTemplateService {
  /**
   * Sanitizes text to prevent HTML injection in template interpolations.
   */
  sanitize(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Wraps message content into the standard WEPGCOMP email layout.
   */
  buildEmailTemplate(message: string): string {
    const sanitizedMessage = this.sanitize(message);

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
            <h1>Portal WEPGCOMP</h1>
          </div>
          <div class="content">
            <div class="message">
              ${sanitizedMessage}
            </div>
          </div>
          <div class="footer">
            <p>Esta é uma mensagem automática do Portal WEPGCOMP</p>
            <p>Por favor, não responda a este e-mail</p>
          </div>
        </div>
      </body>
    </html>
  `;
  }

  /**
   * Generates password reset HTML template.
   */
  buildEmailTemplateEsqueciASenha(resetUrl: string): string {
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
            <h1>Portal WEPGCOMP</h1>
          </div>
          <div class="content">
            <div class="message">
              <p>Clique no botão abaixo para redefinir sua senha:</p>
              <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 15px; margin-top: 8px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a></p>
            </div>
          </div>
          <div class="footer">
            <p>Esta é uma mensagem automática do Portal WEPGCOMP</p>
            <p>Por favor, não responda a este e-mail</p>
          </div>
        </div>
      </body>
    </html>
  `;
  }

  /**
   * Generates contact message HTML.
   */
  buildContactHtml(name: string, email: string, text: string): string {
    const rawContent = `
      <p><strong>Nome:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensagem:</strong></p>
      <p>${text.replace(/\n/g, '<br>')}</p>
    `;
    return this.buildEmailTemplate(rawContent);
  }

  /**
   * Generates professor welcome message HTML.
   */
  buildProfessorWelcomeHtml(
    professorName: string,
    professorEmail: string,
    adminName: string,
    temporaryPassword: string,
  ): string {
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
    return this.buildEmailTemplate(htmlContent);
  }

  /**
   * Generates email confirmation message HTML.
   */
  buildEmailConfirmationHtml(confirmationUrl: string): string {
    const htmlContent = `
      <h2>Confirmação de Cadastro</h2>
      <p>Clique no link abaixo para confirmar seu cadastro:</p>
      <p><a href="${confirmationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Confirmar Cadastro</a></p>
      <p>Ou copie e cole este link no seu navegador:</p>
      <p>${confirmationUrl}</p>
    `;
    return this.buildEmailTemplate(htmlContent);
  }
}
