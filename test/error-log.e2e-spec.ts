import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PersistentLogger } from '../src/error-log/persistent-logger.service';
import { LoggingInterceptor } from '../src/interceptors/logging.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const UUID = /^[0-9a-f-]{36}$/i;

describe('Registro de falhas (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const prisma = {
    errorLog: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    userAccount: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'admin-1',
        level: 'Admin',
        isActive: true,
        name: 'Admin',
        profile: 'Professor',
      }),
    },
    eventEdition: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'e2e-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.errorLog.create.mockClear();
  });

  const savedData = () => prisma.errorLog.create.mock.calls[0][0].data;
  const adminToken = () =>
    jwt.sign({ userId: 'admin-1', email: 'admin@ufba.br', level: 'Admin' });

  it('401 sem token: responde com requestId e persiste a falha', async () => {
    const response = await request(app.getHttpServer())
      .get('/error-logs')
      .expect(401);

    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(response.body).toMatchObject({
      statusCode: 401,
      requestId: response.headers['x-request-id'],
    });
    expect(savedData()).toMatchObject({
      source: 'http',
      level: 'warn',
      statusCode: 401,
      method: 'GET',
      path: '/error-logs',
      route: '/error-logs',
      requestId: response.headers['x-request-id'],
      isAuthenticated: false,
    });
    expect(savedData().context.request.tokenStatus).toBe('missing');
  });

  it('reaproveita um X-Request-Id válido enviado pelo cliente', async () => {
    const requestId = '3f1c2a54-8f6e-4d2b-9a7c-1e2f3a4b5c6d';

    const response = await request(app.getHttpServer())
      .get('/error-logs')
      .set('X-Request-Id', requestId)
      .expect(401);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(savedData().requestId).toBe(requestId);
  });

  it('400 de validação autenticado: grava usuário, rota padrão e handler', async () => {
    await request(app.getHttpServer())
      .get('/error-logs/nao-e-uuid')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(400);

    expect(savedData()).toMatchObject({
      statusCode: 400,
      route: '/error-logs/:id',
      path: '/error-logs/nao-e-uuid',
      isAuthenticated: true,
      userId: 'admin-1',
      userEmail: 'admin@ufba.br',
      userName: 'Admin',
      userProfile: 'Professor',
    });
  });

  it('500 por erro Prisma: não vaza detalhes e grava o código', async () => {
    prisma.errorLog.findUnique.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('detalhe interno', {
        code: 'P2024',
        clientVersion: '5.22.0',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/error-logs/3f1c2a54-8f6e-4d2b-9a7c-1e2f3a4b5c6d')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(500);

    expect(response.body.message).toBe('Erro interno no servidor');
    expect(JSON.stringify(response.body)).not.toContain('detalhe interno');
    expect(savedData()).toMatchObject({
      level: 'error',
      statusCode: 500,
      prismaCode: 'P2024',
      exceptionName: 'PrismaClientKnownRequestError',
      message: 'detalhe interno',
    });
    expect(savedData().context.handler).toEqual({
      controller: 'ErrorLogController',
      method: 'findOne',
    });
  });

  it('com o PersistentLogger instalado, logger.error de services é persistido', async () => {
    const logger = app.get(PersistentLogger);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    app.useLogger(logger);
    const original = new Error('connect ECONNREFUSED');

    new Logger('MailingService').error('Falha ao enviar email', original.stack);
    await new Promise((resolve) => setImmediate(resolve));

    expect(savedData()).toMatchObject({
      source: 'logger',
      level: 'error',
      loggerContext: 'MailingService',
      message: 'Falha ao enviar email',
      exceptionName: 'Error',
    });
    expect(savedData().context.stack).toBe(original.stack);
  });

  it('a listagem aplica os filtros recebidos', async () => {
    await request(app.getHttpServer())
      .get('/error-logs')
      .query({ userEmail: '@ufba.br', statusClass: '5xx', pageSize: 10 })
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);

    const where = prisma.errorLog.findMany.mock.calls.at(-1)[0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { userEmail: { contains: '@ufba.br', mode: 'insensitive' } },
        { OR: [{ statusCode: { gte: 500, lt: 600 } }] },
      ]),
    );
  });
});
