import { Prisma } from '@prisma/client';

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

export interface PrismaErrorDetails {
  type: string;
  code?: string;
  meta?: unknown;
  clientVersion?: string;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.constructor?.name || error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as { cause?: unknown }).cause,
    };
  }

  if (typeof error === 'string') {
    return { name: 'String', message: error };
  }

  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    return {
      name: error.constructor?.name ?? 'Object',
      message: typeof message === 'string' ? message : safeStringify(error),
    };
  }

  return { name: typeof error, message: String(error) };
}

function extractFrom(error: unknown): PrismaErrorDetails | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      type: 'KnownRequestError',
      code: error.code,
      meta: error.meta,
      clientVersion: error.clientVersion,
    };
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      type: 'InitializationError',
      code: error.errorCode,
      clientVersion: error.clientVersion,
    };
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return { type: 'ValidationError', clientVersion: error.clientVersion };
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return { type: 'UnknownRequestError', clientVersion: error.clientVersion };
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return { type: 'RustPanicError', clientVersion: error.clientVersion };
  }
  return undefined;
}

/** Detalhes do erro Prisma no próprio erro ou na sua `cause`. */
export function extractPrismaError(
  error: unknown,
): PrismaErrorDetails | undefined {
  return (
    extractFrom(error) ??
    extractFrom((error as { cause?: unknown } | undefined)?.cause)
  );
}

/** Erros em que o banco está inacessível; consultas extras só atrasariam. */
export function isDatabaseUnavailable(
  details: PrismaErrorDetails | undefined,
): boolean {
  return (
    details?.type === 'InitializationError' ||
    details?.type === 'RustPanicError' ||
    Boolean(details?.code?.startsWith('P1'))
  );
}
