import { Test, TestingModule } from '@nestjs/testing';
import { MailingService } from './mailing.service';
import { MailingTemplateService } from './mailing-template.service';
import { EventEditionService } from '../event-edition/event-edition.service';
import { CommitteeMemberService } from '../committee-member/committee-member.service';
import { PrismaService } from '../prisma/prisma.service';

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
