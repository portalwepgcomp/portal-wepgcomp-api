import { hostname } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  PrismaOperationRecord,
  RequestContext,
} from '../common/request-context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  limitContextSize,
  sanitize,
  truncateString,
} from './error-log.sanitizer';
import {
  extractPrismaError,
  isDatabaseUnavailable,
  normalizeError,
} from './error-normalizer';
import { parseStackLocation } from './stack-parser';

export type ErrorLogSource = 'http' | 'logger' | 'cron' | 'process';
export type ErrorLogLevel = 'error' | 'warn';
export type TokenStatus = 'missing' | 'valid' | 'invalid' | 'expired';

export interface RecordErrorInput {
  source: ErrorLogSource;
  level: ErrorLogLevel;
  error: unknown;
  /** Substitui a mensagem extraída de `error` (ex.: mensagem do logger). */
  message?: string;
  /** Substitui a stack extraída de `error` (ex.: stack passada ao logger). */
  stack?: string;
  /** Substitui o nome extraído de `error`. */
  exceptionName?: string;
  statusCode?: number;
  responseBody?: unknown;
  loggerContext?: string;
  request?: Request;
  extra?: unknown;
}

interface AuthInfo {
  isAuthenticated: boolean;
  tokenStatus: TokenStatus;
  hasAuthorization: boolean;
  userId?: string;
  email?: string;
  level?: string;
}

interface JwtUserPayload {
  userId?: string;
  email?: string;
  level?: string;
}

const MAX_MESSAGE_LENGTH = 10000;
export const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const RUNTIME = {
  nodeEnv: process.env.NODE_ENV,
  hostname: hostname(),
  pid: process.pid,
  nodeVersion: process.version,
  appVersion: process.env.npm_package_version,
};

/**
 * Persiste falhas na tabela `error_log`. `record` nunca rejeita: qualquer falha
 * ao gravar vai para `console.error` (e não para o `Logger`, que é o
 * `PersistentLogger` e geraria loop).
 */
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays() * DAY_MS);
    const { count } = await this.prisma.errorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Retenção: ${count} registro(s) de erro removido(s).`);
    }
    return count;
  }

  private retentionDays(): number {
    const configured = Number(this.config.get('ERROR_LOG_RETENTION_DAYS'));
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_RETENTION_DAYS;
  }

  async record(input: RecordErrorInput): Promise<void> {
    try {
      const data = await this.build(input);
      await this.prisma.errorLog.create({ data });
    } catch (persistError) {
      console.error(
        '[ErrorLogService] Falha ao persistir log de erro:',
        persistError instanceof Error ? persistError.message : persistError,
      );
    }
  }

  /** Grava aguardando no máximo `timeoutMs`; nunca rejeita. */
  recordWithTimeout(input: RecordErrorInput, timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    });
    return Promise.race([this.record(input), timeout]).finally(() =>
      clearTimeout(timer),
    );
  }

  private async build(
    input: RecordErrorInput,
  ): Promise<Prisma.ErrorLogCreateInput> {
    const store = RequestContext.get();
    const request = input.request ?? store?.request;
    const prismaOperations: PrismaOperationRecord[] = store
      ? [...store.prismaOperations]
      : [];

    const normalized = normalizeError(input.error);
    const stack = input.stack ?? normalized.stack;
    const message = input.message ?? normalized.message ?? '';
    const location = parseStackLocation(stack);
    const prismaError = extractPrismaError(input.error);
    const auth = this.resolveAuth(request);
    const userDetails =
      auth.userId && !isDatabaseUnavailable(prismaError)
        ? await this.findUserDetails(auth.userId)
        : undefined;

    const context = limitContextSize({
      stack,
      cause: sanitize(normalized.cause),
      responseBody: sanitize(input.responseBody),
      request: request ? this.describeRequest(request, auth) : undefined,
      handler: store?.handler,
      files: this.describeFiles(request),
      prisma: prismaError && {
        ...prismaError,
        meta: sanitize(prismaError.meta),
      },
      prismaOperations: prismaOperations.map((operation) => ({
        ...operation,
        args: sanitize(operation.args),
      })),
      durationMs: store ? Date.now() - store.startedAt : undefined,
      extra: sanitize(input.extra),
      runtime: RUNTIME,
    });

    return {
      source: input.source,
      level: input.level,
      requestId: store?.requestId,
      statusCode: input.statusCode,
      method: request?.method,
      path: request?.originalUrl?.split('?')[0],
      route: this.resolveRoute(request),
      isAuthenticated: auth.isAuthenticated,
      userId: auth.userId,
      userName: userDetails?.name,
      userEmail: auth.email,
      userLevel: auth.level,
      userProfile: userDetails?.profile,
      exceptionName: input.exceptionName ?? normalized.name,
      message: truncateString(message, MAX_MESSAGE_LENGTH),
      loggerContext: input.loggerContext,
      prismaCode: prismaError?.code,
      file: location?.file,
      line: location?.line,
      column: location?.column,
      functionName: location?.functionName,
      context: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonObject,
    };
  }

  private resolveAuth(request?: Request): AuthInfo {
    const header = request?.headers?.authorization;
    const hasAuthorization = Boolean(header);
    const user = (request as { user?: JwtUserPayload } | undefined)?.user;

    if (user?.userId) {
      return {
        isAuthenticated: true,
        tokenStatus: 'valid',
        hasAuthorization,
        userId: user.userId,
        email: user.email,
        level: user.level,
      };
    }

    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : undefined;
    if (!token) {
      return {
        isAuthenticated: false,
        tokenStatus: 'missing',
        hasAuthorization,
      };
    }

    try {
      const payload = this.jwtService.verify<JwtUserPayload>(token);
      return {
        isAuthenticated: true,
        tokenStatus: 'valid',
        hasAuthorization,
        userId: payload.userId,
        email: payload.email,
        level: payload.level,
      };
    } catch (error) {
      if ((error as Error)?.name === 'TokenExpiredError') {
        // Assinatura válida, só expirado: a identidade é confiável para debug.
        const payload = this.jwtService.decode<JwtUserPayload | null>(token);
        return {
          isAuthenticated: false,
          tokenStatus: 'expired',
          hasAuthorization,
          userId: payload?.userId,
          email: payload?.email,
          level: payload?.level,
        };
      }
      return {
        isAuthenticated: false,
        tokenStatus: 'invalid',
        hasAuthorization,
      };
    }
  }

  private async findUserDetails(
    userId: string,
  ): Promise<{ name: string; profile: string } | undefined> {
    try {
      const user = await this.prisma.userAccount.findUnique({
        where: { id: userId },
        select: { name: true, profile: true },
      });
      return user ?? undefined;
    } catch {
      return undefined;
    }
  }

  private describeRequest(request: Request, auth: AuthInfo) {
    return {
      query: sanitize(request.query),
      params: sanitize(request.params),
      body: sanitize(request.body),
      ip: request.ip,
      userAgent: request.headers?.['user-agent'],
      referer: request.headers?.referer,
      origin: request.headers?.origin,
      hasAuthorization: auth.hasAuthorization,
      tokenStatus: auth.tokenStatus,
    };
  }

  private describeFiles(request?: Request) {
    const { file, files } = (request ?? {}) as {
      file?: Express.Multer.File;
      files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
    };
    const list = [
      ...(file ? [file] : []),
      ...(Array.isArray(files) ? files : Object.values(files ?? {}).flat()),
    ];
    if (list.length === 0) {
      return undefined;
    }
    return list.map(({ fieldname, originalname, mimetype, size }) => ({
      fieldname,
      originalname,
      mimetype,
      size,
    }));
  }

  private resolveRoute(request?: Request): string | undefined {
    const routePath = (request as { route?: { path?: unknown } } | undefined)
      ?.route?.path;
    if (typeof routePath !== 'string') {
      return undefined;
    }
    return `${request?.baseUrl ?? ''}${routePath}`;
  }
}
