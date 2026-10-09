import { Test, TestingModule } from '@nestjs/testing';
import { MailingService } from './mailing.service';
import { MailingTemplateService } from './mailing-template.service';
import { EventEditionService } from '../event-edition/event-edition.service';
import { CommitteeMemberService } from '../committee-member/committee-member.service';
import { PrismaService } from '../prisma/prisma.service';
import { Profile } from '@prisma/client';

const mockSendMailFn = jest.fn().mockResolvedValue({ messageId: '123' });

jest.mock('nodemailer', () => {
  return {
    __esModule: true,
    default: {
      createTransport: jest.fn().mockReturnValue({
        sendMail: jest
          .fn()
          .mockImplementation((...args) => mockSendMailFn(...args)),
      }),
    },
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest
        .fn()
        .mockImplementation((...args) => mockSendMailFn(...args)),
    }),
  };
});

describe('MailingService', () => {
  let service: MailingService;
  let templateService: MailingTemplateService;

  const mockEventEditionService = {
    findActive: jest.fn().mockResolvedValue({ id: 'event-1' }),
  };

  const mockCommitteeMemberService = {
    findCurrentCoordinator: jest
      .fn()
      .mockResolvedValue({ userEmail: 'coord@example.com' }),
  };

  const mockPrismaService = {
    userAccount: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    mockSendMailFn.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailingService,
        MailingTemplateService,
        { provide: EventEditionService, useValue: mockEventEditionService },
        {
          provide: CommitteeMemberService,
          useValue: mockCommitteeMemberService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MailingService>(MailingService);
    templateService = module.get<MailingTemplateService>(
      MailingTemplateService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(templateService).toBeDefined();
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const res = await service.sendEmail({
        from: 'test@example.com',
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Test Text',
      });

      expect(res).toEqual({ message: 'Email sent successfully' });
      expect(mockSendMailFn).toHaveBeenCalled();
    });
  });

  describe('sendEmailConfirmation', () => {
    const originalFrontendUrl = process.env.FRONTEND_URL;

    afterEach(() => {
      if (originalFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = originalFrontendUrl;
      }
    });

    it('should link to the front-end route, not to the API endpoint', async () => {
      process.env.FRONTEND_URL = 'https://portal.example.com';

      await service.sendEmailConfirmation('user@example.com', 'jwt-token');

      expect(mockSendMailFn).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.html).toContain(
        'https://portal.example.com/confirmar-email?token=jwt-token',
      );
      expect(mailOptions.html).not.toContain('/users/confirm-email');
    });
  });

  describe('sendApprovalRequestEmail', () => {
    const originalFrontendUrl = process.env.FRONTEND_URL;

    beforeEach(() => {
      process.env.FRONTEND_URL = 'https://portal.example.com';
    });

    afterEach(() => {
      if (originalFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = originalFrontendUrl;
      }
    });

    it('should send to admins via bcc with a link to the users screen', async () => {
      await service.sendApprovalRequestEmail(
        ['admin1@example.com', 'admin2@example.com'],
        {
          name: 'Maria Silva',
          email: 'maria+tcc@example.com',
          profile: Profile.Presenter,
          registrationNumber: 'REG456',
        },
      );

      expect(mockSendMailFn).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.bcc).toEqual([
        'admin1@example.com',
        'admin2@example.com',
      ]);
      expect(mailOptions.subject).toContain('apresentador');
      expect(mailOptions.html).toContain('Maria Silva');
      expect(mailOptions.html).toContain('REG456');
      expect(mailOptions.html).toContain(
        'https://portal.example.com/usuarios?busca=maria%2Btcc%40example.com',
      );
    });

    it('should use the re-approval wording when the registration changed', async () => {
      await service.sendApprovalRequestEmail(['admin@example.com'], {
        name: 'Maria Silva',
        email: 'maria@ufba.br',
        profile: Profile.Presenter,
        registrationNumber: '2021002',
        reason: 'registration-change',
      });

      const mailOptions = mockSendMailFn.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Matrícula alterada');
      expect(mailOptions.html).toContain('alterou a própria matrícula');
      expect(mailOptions.html).toContain('2021002');
    });

    it('should label professors correctly', async () => {
      await service.sendApprovalRequestEmail(['admin@example.com'], {
        name: 'Prof',
        email: 'prof@example.com',
        profile: Profile.Professor,
      });

      expect(mockSendMailFn.mock.calls[0][0].subject).toContain('professor');
    });

    it('should sanitize applicant data', async () => {
      await service.sendApprovalRequestEmail(['admin@example.com'], {
        name: '<script>alert(1)</script>',
        email: 'x@example.com',
        profile: Profile.Presenter,
      });

      const html = mockSendMailFn.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should do nothing without recipients', async () => {
      await service.sendApprovalRequestEmail([], {
        name: 'A',
        email: 'a@example.com',
        profile: Profile.Presenter,
      });

      expect(mockSendMailFn).not.toHaveBeenCalled();
    });

    it('should not throw when sending fails', async () => {
      mockSendMailFn.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(
        service.sendApprovalRequestEmail(['admin@example.com'], {
          name: 'A',
          email: 'a@example.com',
          profile: Profile.Presenter,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('templateService', () => {
    it('should sanitize HTML characters in template', () => {
      const sanitized = templateService.sanitize('<script>alert("x")</script>');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should build email template with header and footer', () => {
      const html = templateService.buildEmailTemplate('Teste de mensagem');
      expect(html).toContain('Portal WEPGCOMP');
      expect(html).toContain('Teste de mensagem');
    });

    it('should build forgot password template with reset link', () => {
      const html = templateService.buildEmailTemplateEsqueciASenha(
        'https://example.com/reset?token=123',
      );
      expect(html).toContain('Redefinir Senha');
      expect(html).toContain('https://example.com/reset?token=123');
    });
  });
});
