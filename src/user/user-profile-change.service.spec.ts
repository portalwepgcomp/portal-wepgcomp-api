import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Profile, Subprofile, UserLevel } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileChangeService } from './user-profile-change.service';

describe('UserProfileChangeService', () => {
  let service: UserProfileChangeService;
  let prisma: {
    userAccount: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let mailing: { sendProfileChangeRequestEmail: jest.Mock };

  const listener = {
    id: 'user-1',
    name: 'Maria',
    email: 'maria@ufba.br',
    profile: Profile.Listener,
    subprofile: Subprofile.Master,
    level: UserLevel.Default,
    isActive: true,
    isTeacherActive: false,
    isPresenterActive: false,
    requestedProfile: null,
    requestedSubprofile: null,
    profileRequestedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      userAccount: {
        findUnique: jest.fn().mockResolvedValue(listener),
        findMany: jest.fn().mockResolvedValue([{ email: 'admin@ufba.br' }]),
        update: jest.fn(async ({ data }) => ({ ...listener, ...data })),
      },
    };
    mailing = { sendProfileChangeRequestEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileChangeService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailingService, useValue: mailing },
      ],
    }).compile();

    service = module.get(UserProfileChangeService);
  });

  describe('requestProfileChange', () => {
    it('registra a solicitação sem alterar o perfil e avisa os admins', async () => {
      const result = await service.requestProfileChange('user-1', {
        profile: Profile.Presenter,
      });

      const { data } = prisma.userAccount.update.mock.calls[0][0];
      expect(data).toEqual({
        requestedProfile: Profile.Presenter,
        requestedSubprofile: null,
        profileRequestedAt: expect.any(Date),
      });
      expect(data).not.toHaveProperty('profile');
      expect(result.profile).toBe(Profile.Listener);
      expect(result.requestedProfile).toBe(Profile.Presenter);
      await new Promise(process.nextTick);
      expect(mailing.sendProfileChangeRequestEmail).toHaveBeenCalledWith(
        ['admin@ufba.br'],
        expect.objectContaining({
          currentProfileLabel: 'Ouvinte (Mestrando)',
          requestedProfileLabel: 'Apresentador',
        }),
      );
    });

    it('permite trocar apenas o tipo de ouvinte', async () => {
      await service.requestProfileChange('user-1', {
        profile: Profile.Listener,
        subprofile: Subprofile.Doctorate,
      });

      expect(prisma.userAccount.update.mock.calls[0][0].data).toMatchObject({
        requestedProfile: Profile.Listener,
        requestedSubprofile: Subprofile.Doctorate,
      });
    });

    it('recusa pedido para o perfil atual', async () => {
      await expect(
        service.requestProfileChange('user-1', {
          profile: Profile.Listener,
          subprofile: Subprofile.Master,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
    });

    it('exige e-mail @ufba.br para perfis da UFBA', async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        ...listener,
        email: 'maria@gmail.com',
        subprofile: Subprofile.Other,
      });

      await expect(
        service.requestProfileChange('user-1', { profile: Profile.Professor }),
      ).rejects.toThrow('O perfil solicitado exige um e-mail @ufba.br.');
    });

    it('bloqueia usuário inativo', async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        ...listener,
        isActive: false,
      });

      await expect(
        service.requestProfileChange('user-1', { profile: Profile.Presenter }),
      ).rejects.toThrow(AppException);
    });

    it('não falha quando o aviso por e-mail falha', async () => {
      mailing.sendProfileChangeRequestEmail.mockRejectedValue(
        new Error('smtp'),
      );

      await expect(
        service.requestProfileChange('user-1', { profile: Profile.Presenter }),
      ).resolves.toBeDefined();
    });
  });

  describe('approveProfileChange', () => {
    it('aplica o perfil pedido, ativa o papel e limpa a solicitação', async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        ...listener,
        requestedProfile: Profile.Professor,
        profileRequestedAt: new Date(),
      });

      const result = await service.approveProfileChange(
        'user-1',
        'admin@ufba.br',
      );

      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          profile: Profile.Professor,
          subprofile: null,
          isTeacherActive: true,
          isPresenterActive: false,
          requestedProfile: null,
          requestedSubprofile: null,
          profileRequestedAt: null,
          updatedBy: 'admin@ufba.br',
        }),
      });
      expect(result.profile).toBe(Profile.Professor);
      expect(result.level).toBe(UserLevel.Default);
    });

    it('retorna 404 quando não há solicitação pendente', async () => {
      await expect(
        service.approveProfileChange('user-1', 'admin@ufba.br'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectProfileChange / cancelProfileChange', () => {
    beforeEach(() => {
      prisma.userAccount.findUnique.mockResolvedValue({
        ...listener,
        requestedProfile: Profile.Presenter,
      });
    });

    it.each(['rejectProfileChange', 'cancelProfileChange'] as const)(
      '%s limpa a solicitação sem mudar o perfil',
      async (method) => {
        const result = await service[method]('user-1');

        expect(prisma.userAccount.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: {
            requestedProfile: null,
            requestedSubprofile: null,
            profileRequestedAt: null,
          },
        });
        expect(result.profile).toBe(Profile.Listener);
      },
    );
  });
});
