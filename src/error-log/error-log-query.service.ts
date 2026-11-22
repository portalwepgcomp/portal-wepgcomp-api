import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponseDto } from '../shared/dto/paginated-response.dto';
import {
  ErrorLogGroupByField,
  ErrorLogQueryDto,
  ErrorLogStatusClass,
  ErrorLogSummaryQueryDto,
} from './dto/error-log-query.dto';

export const DEFAULT_PERIOD_DAYS = 7;
export const SUMMARY_LIMIT = 50;
const SUMMARY_TIME_ZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;

export const ERROR_LOG_LIST_SELECT = {
  id: true,
  createdAt: true,
  source: true,
  level: true,
  requestId: true,
  statusCode: true,
  method: true,
  path: true,
  route: true,
  isAuthenticated: true,
  userId: true,
  userName: true,
  userEmail: true,
  userLevel: true,
  userProfile: true,
  exceptionName: true,
  message: true,
  loggerContext: true,
  prismaCode: true,
  file: true,
  line: true,
  column: true,
  functionName: true,
} satisfies Prisma.ErrorLogSelect;

export type ErrorLogListItem = Prisma.ErrorLogGetPayload<{
  select: typeof ERROR_LOG_LIST_SELECT;
}>;

export interface ErrorLogSummaryItem {
  key: string | number | null;
  count: number;
  lastOccurrence: Date | null;
}

type GroupableField = Exclude<ErrorLogGroupByField, 'day'>;

const STATUS_CLASS_RANGES: Record<
  ErrorLogStatusClass,
  { gte: number; lt: number }
> = {
  '4xx': { gte: 400, lt: 500 },
  '5xx': { gte: 500, lt: 600 },
};

const insensitiveContains = (value: string) => ({
  contains: value,
  mode: Prisma.QueryMode.insensitive,
});

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SUMMARY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class ErrorLogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtro único da listagem e do `summary`, para os dois verem o mesmo recorte. */
  buildWhere(
    query: ErrorLogQueryDto,
    now: Date = new Date(),
  ): Prisma.ErrorLogWhereInput {
    const and: Prisma.ErrorLogWhereInput[] = [];

    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      });
    } else {
      and.push({
        createdAt: {
          gte: new Date(now.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS),
        },
      });
    }

    if (query.userEmail) {
      and.push({ userEmail: insensitiveContains(query.userEmail) });
    }
    if (query.userName) {
      and.push({ userName: insensitiveContains(query.userName) });
    }
    if (query.message) {
      and.push({ message: insensitiveContains(query.message) });
    }
    if (query.path) {
      and.push({ path: insensitiveContains(query.path) });
    }
    if (query.file) {
      and.push({ file: insensitiveContains(query.file) });
    }

    if (query.userId) {
      and.push({ userId: query.userId });
    }
    if (query.route) {
      and.push({ route: query.route });
    }
    if (query.requestId) {
      and.push({ requestId: query.requestId });
    }
    if (query.isAuthenticated !== undefined) {
      and.push({ isAuthenticated: query.isAuthenticated });
    }

    if (query.userLevel?.length) {
      and.push({ userLevel: { in: query.userLevel } });
    }
    if (query.userProfile?.length) {
      and.push({ userProfile: { in: query.userProfile } });
    }
    if (query.source?.length) {
      and.push({ source: { in: query.source } });
    }
    if (query.level?.length) {
      and.push({ level: { in: query.level } });
    }
    if (query.statusCode?.length) {
      and.push({ statusCode: { in: query.statusCode } });
    }
    if (query.exceptionName?.length) {
      and.push({ exceptionName: { in: query.exceptionName } });
    }
    if (query.prismaCode?.length) {
      and.push({ prismaCode: { in: query.prismaCode } });
    }
    if (query.method?.length) {
      and.push({ method: { in: query.method } });
    }
    if (query.loggerContext?.length) {
      and.push({ loggerContext: { in: query.loggerContext } });
    }

    if (query.statusClass?.length) {
      and.push({
        OR: query.statusClass.map((statusClass) => ({
          statusCode: STATUS_CLASS_RANGES[statusClass],
        })),
      });
    }

    const search = query.search?.trim();
    if (search) {
      and.push({
        OR: [
          { message: insensitiveContains(search) },
          { userEmail: insensitiveContains(search) },
          { userName: insensitiveContains(search) },
          { path: insensitiveContains(search) },
          { exceptionName: insensitiveContains(search) },
        ],
      });
    }

    return { AND: and };
  }

  async list(
    query: ErrorLogQueryDto,
  ): Promise<PaginatedResponseDto<ErrorLogListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.errorLog.findMany({
        where,
        select: ERROR_LOG_LIST_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return PaginatedResponseDto.create(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const log = await this.prisma.errorLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException('Registro de erro não encontrado.');
    }

    const related = log.requestId
      ? await this.prisma.errorLog.findMany({
          where: { requestId: log.requestId, id: { not: log.id } },
          select: ERROR_LOG_LIST_SELECT,
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return { ...log, related };
  }

  async summary(
    query: ErrorLogSummaryQueryDto,
  ): Promise<ErrorLogSummaryItem[]> {
    const where = this.buildWhere(query);
    return query.groupBy === 'day'
      ? this.summaryByDay(where)
      : this.summaryByField(query.groupBy, where);
  }

  private async summaryByField(
    field: GroupableField,
    where: Prisma.ErrorLogWhereInput,
  ): Promise<ErrorLogSummaryItem[]> {
    const rows = await this.prisma.errorLog.groupBy({
      by: [field],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { id: 'desc' } },
      take: SUMMARY_LIMIT,
    });

    return rows.map((row) => ({
      key: row[field] ?? null,
      count: row._count._all,
      lastOccurrence: row._max.createdAt ?? null,
    }));
  }

  /**
   * O `groupBy` do Prisma não trunca datas; agrupar em memória mantém o mesmo
   * `where` da listagem. Lê só `createdAt` e o período já é limitado.
   */
  private async summaryByDay(
    where: Prisma.ErrorLogWhereInput,
  ): Promise<ErrorLogSummaryItem[]> {
    const rows = await this.prisma.errorLog.findMany({
      where,
      select: { createdAt: true },
    });

    const buckets = new Map<string, ErrorLogSummaryItem>();
    for (const { createdAt } of rows) {
      const key = dayFormatter.format(createdAt);
      const bucket = buckets.get(key);
      if (!bucket) {
        buckets.set(key, { key, count: 1, lastOccurrence: createdAt });
        continue;
      }
      bucket.count += 1;
      if (bucket.lastOccurrence && createdAt > bucket.lastOccurrence) {
        bucket.lastOccurrence = createdAt;
      }
    }

    return [...buckets.values()]
      .sort((a, b) => String(b.key).localeCompare(String(a.key)))
      .slice(0, SUMMARY_LIMIT);
  }
}
