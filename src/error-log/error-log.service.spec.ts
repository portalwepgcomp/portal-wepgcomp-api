import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { RequestContext } from '../common/request-context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { REDACTED } from './error-log.sanitizer';
import { DEFAULT_RETENTION_DAYS, ErrorLogService } from './error-log.service';

const SECRET = 'test-secret';

function buildRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    originalUrl: '/submission/abc?x=1',
    baseUrl: '',
    route: { path: '/submission/:id' },
    query: { x: '1' },
    params: { id: 'abc' },
    body: { title: 'T', password: 'secret' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
    ...overrides,
  } as unknown as Request;
}

describe('ErrorLogService', () => {
  let service: ErrorLogService;
  let prisma: {
    errorLog: { create: jest.Mock; deleteMany: jest.Mock };
    userAccount: { findUnique: jest.Mock };
  };
  let config: { get: jest.Mock };
  const jwtService = new JwtService({ secret: SECRET });

  beforeEach(() => {
    prisma = {
      errorLog: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      userAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Ana', profile: 'Presenter' }),
      },
    };
    config = { get: jest.fn() };
    service = new ErrorLogService(
      prisma as unknown as PrismaService,
      jwtService,
      config as unknown as ConfigService,
    );
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const savedData = () => prisma.errorLog.create.mock.calls[0][0].data;

  it('grava requisição, usuário autenticado, rota e localização no código', async () => {
    const request = buildRequest({
      user: { userId: 'u1', email: 'ana@ufba.br', level: 'Default' },
    } as Partial<Request>);

    await service.record({
      source: 'http',
      level: 'warn',
      error: new BadRequestException('Dados inválidos.'),
      statusCode: 400,
      responseBody: { message: 'Dados inválidos.' },
      request,
    });

    const data = savedData();
    expect(data).toMatchObject({
      source: 'http',
      level: 'warn',
      statusCode: 400,
      method: 'POST',
      path: '/submission/abc',
      route: '/submission/:id',
      isAuthenticated: true,
      userId: 'u1',
      userEmail: 'ana@ufba.br',
      userLevel: 'Default',
      userName: 'Ana',
      userProfile: 'Presenter',
      exceptionName: 'BadRequestException',
      message: 'Dados inválidos.',
    });
    expect(data.file).toMatch(/error-log\.service\.spec\.ts$/);
    expect(data.context.request.body).toEqual({
      title: 'T',
      password: REDACTED,
    });
    expect(data.context.request.tokenStatus).toBe('valid');
  });

  it('identifica o usuário pelo token em rotas sem guard', async () => {
    const token = jwtService.sign({
      userId: 'u2',
      email: 'bia@ufba.br',
      level: 'Admin',
    });

    await service.record({
      source: 'http',
      level: 'error',
      error: new Error('boom'),
      request: buildRequest({
        headers: { authorization: `Bearer ${token}` },
      } as Partial<Request>),
    });

    expect(savedData()).toMatchObject({
      isAuthenticated: true,
      userId: 'u2',
      userEmail: 'bia@ufba.br',
      userLevel: 'Admin',
    });
  });

  it('classifica token expirado sem marcar como autenticado', async () => {
    const token = jwtService.sign(
      { userId: 'u3', email: 'c@ufba.br', level: 'Default' },
      { expiresIn: -10 },
    );

    await service.record({
      source: 'http',
      level: 'warn',
      error: new Error('Unauthorized'),
      request: buildRequest({
        headers: { authorization: `Bearer ${token}` },
      } as Partial<Request>),
    });

    const data = savedData();
    expect(data.isAuthenticated).toBe(false);
    expect(data.userId).toBe('u3');
    expect(data.context.request.tokenStatus).toBe('expired');
  });

  it('não confia no payload de token com assinatura inválida', async () => {
    const forged = new JwtService({ secret: 'other' }).sign({ userId: 'x' });

    await service.record({
      source: 'http',
      level: 'warn',
      error: new Error('Unauthorized'),
      request: buildRequest({
        headers: { authorization: `Bearer ${forged}` },
      } as Partial<Request>),
    });

    const data = savedData();
    expect(data.userId).toBeUndefined();
    expect(data.context.request.tokenStatus).toBe('invalid');
    expect(prisma.userAccount.findUnique).not.toHaveBeenCalled();
  });

  it('preenche detalhes de erro Prisma e as operações da requisição', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['email'] } },
    );

    await RequestContext.run(
      {
        requestId: 'req-1',
        startedAt: Date.now(),
        request: buildRequest(),
        handler: { controller: 'UserController', method: 'create' },
        prismaOperations: [
          {
            model: 'UserAccount',
            action: 'create',
            args: { data: { email: 'a@b.com', password: 'p' } },
            durationMs: 3,
            failed: true,
          },
        ],
      },
      () =>
        service.record({ source: 'http', level: 'error', error: prismaError }),
    );

    const data = savedData();
    expect(data.requestId).toBe('req-1');
    expect(data.prismaCode).toBe('P2002');
    expect(data.context.prisma).toMatchObject({
      type: 'KnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
    });
    expect(data.context.handler).toEqual({
      controller: 'UserController',
      method: 'create',
    });
    expect(data.context.prismaOperations[0]).toMatchObject({
      model: 'UserAccount',
      failed: true,
      args: { data: { email: 'a@b.com', password: REDACTED } },
    });
  });

  it('não consulta o usuário quando o banco está inacessível', async () => {
    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      '5.22.0',
      'P1001',
    );

    await service.record({
      source: 'http',
      level: 'error',
      error,
      request: buildRequest({
        user: { userId: 'u1' },
      } as Partial<Request>),
    });

    expect(prisma.userAccount.findUnique).not.toHaveBeenCalled();
    expect(savedData().prismaCode).toBe('P1001');
  });

  it('nunca rejeita quando o insert falha', async () => {
    prisma.errorLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({ source: 'logger', level: 'error', error: 'x' }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('recordWithTimeout não espera além do limite', async () => {
    prisma.errorLog.create.mockReturnValue(new Promise(() => undefined));

    const startedAt = Date.now();
    await service.recordWithTimeout(
      { source: 'http', level: 'error', error: new Error('x') },
      50,
    );

    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  describe('purgeExpired', () => {
    const now = new Date('2026-11-21T03:00:00.000Z');

    it('usa a retenção padrão quando a variável não está definida', async () => {
      await service.purgeExpired(now);

      const cutoff =
        prisma.errorLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
      expect(now.getTime() - cutoff.getTime()).toBe(
        DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
    });

    it('respeita ERROR_LOG_RETENTION_DAYS e retorna a contagem', async () => {
      config.get.mockReturnValue('30');
      prisma.errorLog.deleteMany.mockResolvedValue({ count: 7 });

      await expect(service.purgeExpired(now)).resolves.toBe(7);
      const cutoff =
        prisma.errorLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
      expect(cutoff.toISOString()).toBe('2026-10-22T03:00:00.000Z');
    });

    it('ignora valores inválidos', async () => {
      config.get.mockReturnValue('abc');

      await service.purgeExpired(now);
      const cutoff =
        prisma.errorLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
      expect(now.getTime() - cutoff.getTime()).toBe(
        DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
    });
  });
});
