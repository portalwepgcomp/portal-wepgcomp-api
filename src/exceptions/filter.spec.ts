import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { RequestContext } from '../common/request-context/request-context';
import { ErrorLogService } from '../error-log/error-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpExceptionFilter } from './filter';

function createHost(request: object = { method: 'GET', url: '/x' }) {
  const response = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response, request };
}

describe('HttpExceptionFilter', () => {
  let errorLogService: { recordWithTimeout: jest.Mock };
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    errorLogService = {
      recordWithTimeout: jest.fn().mockResolvedValue(undefined),
    };
    filter = new HttpExceptionFilter(
      errorLogService as unknown as ErrorLogService,
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('mantém o contrato de resposta e acrescenta requestId', async () => {
    const { host, response } = createHost();
    const exception = new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: [{ field: 'title', messages: ['obrigatório'] }],
    });

    await RequestContext.run(
      {
        requestId: 'req-42',
        startedAt: Date.now(),
        request: {} as never,
        prismaOperations: [],
      },
      () => filter.catch(exception, host),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      details: [{ field: 'title', messages: ['obrigatório'] }],
      requestId: 'req-42',
    });
  });

  it('persiste 4xx como warn e 5xx como error', async () => {
    const { host, request } = createHost();

    await filter.catch(new NotFoundException('Não encontrado'), host);
    await filter.catch(new Error('falha inesperada'), host);

    const [warnCall, errorCall] = errorLogService.recordWithTimeout.mock.calls;
    expect(warnCall[0]).toMatchObject({
      source: 'http',
      level: 'warn',
      statusCode: 404,
      request,
    });
    expect(errorCall[0]).toMatchObject({
      source: 'http',
      level: 'error',
      statusCode: 500,
    });
  });

  it('não expõe detalhes de erros inesperados ao cliente', async () => {
    const { host, response } = createHost();
    const prismaError = new Prisma.PrismaClientKnownRequestError('segredo', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });

    await filter.catch(prismaError, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Erro interno no servidor',
      requestId: undefined,
    });
    expect(errorLogService.recordWithTimeout.mock.calls[0][0].error).toBe(
      prismaError,
    );
  });

  it('responde normalmente quando o insert do log falha', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    const failingPrisma = {
      errorLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      userAccount: { findUnique: jest.fn() },
    };
    const realFilter = new HttpExceptionFilter(
      new ErrorLogService(
        failingPrisma as unknown as PrismaService,
        new JwtService({ secret: 's' }),
        { get: jest.fn() } as unknown as ConfigService,
      ),
    );
    const { host, response } = createHost({
      method: 'GET',
      url: '/x',
      headers: {},
    });

    await realFilter.catch(new NotFoundException('Não encontrado'), host);

    expect(failingPrisma.errorLog.create).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Não encontrado',
      error: 'Not Found',
      requestId: undefined,
    });
  });

  it('não tenta responder se os headers já foram enviados', async () => {
    const { host, response } = createHost();
    response.headersSent = true;

    await filter.catch(new Error('x'), host);

    expect(response.status).not.toHaveBeenCalled();
  });
});
