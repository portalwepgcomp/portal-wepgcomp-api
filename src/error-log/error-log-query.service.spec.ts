import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import {
  ErrorLogQueryDto,
  ErrorLogSummaryQueryDto,
} from './dto/error-log-query.dto';
import {
  DEFAULT_PERIOD_DAYS,
  ERROR_LOG_LIST_SELECT,
  ErrorLogQueryService,
  SUMMARY_LIMIT,
} from './error-log-query.service';

const insensitive = (value: string) => ({
  contains: value,
  mode: Prisma.QueryMode.insensitive,
});

function toDto(plain: Record<string, unknown>): ErrorLogQueryDto {
  return plainToInstance(ErrorLogQueryDto, plain);
}

describe('ErrorLogQueryService', () => {
  let service: ErrorLogQueryService;
  let prisma: {
    $transaction: jest.Mock;
    errorLog: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
      errorLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ErrorLogQueryService(prisma as unknown as PrismaService);
  });

  describe('buildWhere', () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    const conditions = (plain: Record<string, unknown>) =>
      service.buildWhere(toDto(plain), now).AND as Prisma.ErrorLogWhereInput[];

    it('aplica os últimos 7 dias quando não há período', () => {
      expect(conditions({})).toEqual([
        {
          createdAt: {
            gte: new Date(
              now.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000,
            ),
          },
        },
      ]);
    });

    it('usa from/to informados no lugar do padrão', () => {
      expect(conditions({ from: '2026-01-01', to: '2026-01-31' })[0]).toEqual({
        createdAt: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-01-31'),
        },
      });
      expect(conditions({ to: '2026-01-31' })[0]).toEqual({
        createdAt: { lte: new Date('2026-01-31') },
      });
    });

    it('filtra usuário por e-mail e nome sem diferenciar maiúsculas', () => {
      const where = conditions({
        userEmail: '@UFBA.br',
        userName: 'ana',
        userId: 'u1',
        isAuthenticated: 'false',
        userLevel: 'Admin,Default',
        userProfile: 'Professor',
      });

      expect(where).toEqual(
        expect.arrayContaining([
          { userEmail: insensitive('@UFBA.br') },
          { userName: insensitive('ana') },
          { userId: 'u1' },
          { isAuthenticated: false },
          { userLevel: { in: ['Admin', 'Default'] } },
          { userProfile: { in: ['Professor'] } },
        ]),
      );
    });

    it('converte listas separadas por vírgula em filtros `in`', () => {
      const where = conditions({
        source: 'http,cron',
        level: 'error',
        statusCode: '500,502',
        exceptionName: 'TypeError',
        prismaCode: 'P2002,P2025',
        method: 'post,get',
        loggerContext: 'MailingService',
      });

      expect(where).toEqual(
        expect.arrayContaining([
          { source: { in: ['http', 'cron'] } },
          { level: { in: ['error'] } },
          { statusCode: { in: [500, 502] } },
          { exceptionName: { in: ['TypeError'] } },
          { prismaCode: { in: ['P2002', 'P2025'] } },
          { method: { in: ['POST', 'GET'] } },
          { loggerContext: { in: ['MailingService'] } },
        ]),
      );
    });

    it('converte statusClass em faixas', () => {
      expect(conditions({ statusClass: '4xx,5xx' })).toContainEqual({
        OR: [
          { statusCode: { gte: 400, lt: 500 } },
          { statusCode: { gte: 500, lt: 600 } },
        ],
      });
    });

    it('filtra onde ocorreu e correlação', () => {
      const where = conditions({
        path: '/submission',
        route: '/submission/:id',
        file: 'certificate.service',
        message: 'unique',
        requestId: 'req-1',
      });

      expect(where).toEqual(
        expect.arrayContaining([
          { path: insensitive('/submission') },
          { route: '/submission/:id' },
          { file: insensitive('certificate.service') },
          { message: insensitive('unique') },
          { requestId: 'req-1' },
        ]),
      );
    });

    it('busca livre em OR entre mensagem, e-mail, nome, path e exceção', () => {
      expect(conditions({ search: ' smtp ' })).toContainEqual({
        OR: [
          { message: insensitive('smtp') },
          { userEmail: insensitive('smtp') },
          { userName: insensitive('smtp') },
          { path: insensitive('smtp') },
          { exceptionName: insensitive('smtp') },
        ],
      });
    });
  });

  describe('list', () => {
    it('pagina, ordena por createdAt desc e não traz o context', async () => {
      prisma.errorLog.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.errorLog.count.mockResolvedValue(41);

      const result = await service.list(toDto({ page: '3', pageSize: '20' }));

      expect(prisma.errorLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: ERROR_LOG_LIST_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 40,
          take: 20,
        }),
      );
      expect(ERROR_LOG_LIST_SELECT).not.toHaveProperty('context');
      expect(result).toMatchObject({
        items: [{ id: '1' }],
        total: 41,
        page: 3,
        pageSize: 20,
        totalPages: 3,
      });
    });

    it('usa a ordenação pedida', async () => {
      await service.list(toDto({ sortBy: 'statusCode', sortOrder: 'asc' }));

      expect(prisma.errorLog.findMany.mock.calls[0][0].orderBy).toEqual([
        { statusCode: 'asc' },
        { id: 'desc' },
      ]);
    });
  });

  describe('findOne', () => {
    it('traz os registros relacionados pelo requestId', async () => {
      prisma.errorLog.findUnique.mockResolvedValue({
        id: 'a',
        requestId: 'req-1',
      });
      prisma.errorLog.findMany.mockResolvedValue([{ id: 'b' }]);

      const result = await service.findOne('a');

      expect(prisma.errorLog.findMany).toHaveBeenCalledWith({
        where: { requestId: 'req-1', id: { not: 'a' } },
        select: ERROR_LOG_LIST_SELECT,
        orderBy: { createdAt: 'asc' },
      });
      expect(result.related).toEqual([{ id: 'b' }]);
    });

    it('não busca relacionados sem requestId', async () => {
      prisma.errorLog.findUnique.mockResolvedValue({
        id: 'a',
        requestId: null,
      });

      const result = await service.findOne('a');

      expect(prisma.errorLog.findMany).not.toHaveBeenCalled();
      expect(result.related).toEqual([]);
    });

    it('lança 404 quando não existe', async () => {
      prisma.errorLog.findUnique.mockResolvedValue(null);

      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('summary', () => {
    const summaryDto = (plain: Record<string, unknown>) =>
      plainToInstance(ErrorLogSummaryQueryDto, plain);

    it('agrupa por campo usando o mesmo where da listagem', async () => {
      const lastOccurrence = new Date('2026-11-20T10:00:00.000Z');
      prisma.errorLog.groupBy.mockResolvedValue([
        {
          exceptionName: 'TypeError',
          _count: { _all: 5 },
          _max: { createdAt: lastOccurrence },
        },
      ]);
      const plain = { groupBy: 'exceptionName', userEmail: 'ana' };
      jest.useFakeTimers({ now: new Date('2026-11-21T12:00:00.000Z') });

      const result = await service.summary(summaryDto(plain));
      const expectedWhere = service.buildWhere(summaryDto(plain));
      jest.useRealTimers();

      expect(prisma.errorLog.groupBy).toHaveBeenCalledWith({
        by: ['exceptionName'],
        where: expectedWhere,
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _count: { id: 'desc' } },
        take: SUMMARY_LIMIT,
      });
      expect(result).toEqual([{ key: 'TypeError', count: 5, lastOccurrence }]);
    });

    it('agrupa por dia no fuso de São Paulo', async () => {
      prisma.errorLog.findMany.mockResolvedValue([
        { createdAt: new Date('2026-11-21T02:00:00.000Z') },
        { createdAt: new Date('2026-11-20T15:00:00.000Z') },
        { createdAt: new Date('2026-11-21T12:00:00.000Z') },
      ]);

      const result = await service.summary(summaryDto({ groupBy: 'day' }));

      expect(result).toEqual([
        {
          key: '2026-11-21',
          count: 1,
          lastOccurrence: new Date('2026-11-21T12:00:00.000Z'),
        },
        {
          key: '2026-11-20',
          count: 2,
          lastOccurrence: new Date('2026-11-21T02:00:00.000Z'),
        },
      ]);
    });
  });
});
