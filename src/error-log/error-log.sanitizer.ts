export const REDACTED = '[REDACTED]';
export const TRUNCATED = '[TRUNCATED]';

export const MAX_DEPTH = 6;
export const MAX_STRING_LENGTH = 2000;
export const MAX_ARRAY_ITEMS = 50;
export const MAX_CONTEXT_BYTES = 32 * 1024;
const MAX_TRUNCATED_STACK_LENGTH = 4000;

const SENSITIVE_KEY = /password|senha|token|secret|authorization|cookie|hash/i;
const BCRYPT_HASH = /^\$2[abxy]\$\d{2}\$/;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

export function truncateString(
  value: string,
  maxLength = MAX_STRING_LENGTH,
): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...[+${value.length - maxLength} chars]`;
}

function sanitizeString(value: string): string {
  if (BCRYPT_HASH.test(value) || JWT.test(value)) {
    return REDACTED;
  }
  return truncateString(value);
}

/**
 * Converte qualquer valor em algo serializável em JSON, sem dados sensíveis e
 * com tamanho limitado. Nunca lança.
 */
export function sanitize(
  value: unknown,
  depth = 0,
  ancestors: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  switch (typeof value) {
    case 'string':
      return sanitizeString(value);
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
      return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
    case 'symbol':
      return value.toString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }

  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    return `[Binary ${(value as ArrayBufferView).byteLength} bytes]`;
  }

  const objectValue = value as object;

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (ancestors.has(objectValue)) {
    return '[Circular]';
  }

  ancestors.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      const items = objectValue
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitize(item, depth + 1, ancestors));
      if (objectValue.length > MAX_ARRAY_ITEMS) {
        items.push(`[+${objectValue.length - MAX_ARRAY_ITEMS} items]`);
      }
      return items;
    }

    if (objectValue instanceof Error) {
      return {
        name: objectValue.name,
        message: sanitizeString(objectValue.message),
        stack: objectValue.stack
          ? truncateString(objectValue.stack, MAX_TRUNCATED_STACK_LENGTH)
          : undefined,
        cause: sanitize(
          (objectValue as { cause?: unknown }).cause,
          depth + 1,
          ancestors,
        ),
      };
    }

    const withToJson = objectValue as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === 'function') {
      return sanitize(withToJson.toJSON(), depth + 1, ancestors);
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(objectValue)) {
      if (entry === undefined) {
        continue;
      }
      result[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : sanitize(entry, depth + 1, ancestors);
    }
    return result;
  } catch {
    return '[Unserializable]';
  } finally {
    ancestors.delete(objectValue);
  }
}

export interface ErrorLogContext {
  [key: string]: unknown;
  stack?: string;
  cause?: unknown;
  responseBody?: unknown;
  extra?: unknown;
  request?: {
    [key: string]: unknown;
    body?: unknown;
    query?: unknown;
    params?: unknown;
  };
  prisma?: { [key: string]: unknown; meta?: unknown };
  prismaOperations?: Array<{ [key: string]: unknown; args: unknown }>;
  runtime?: unknown;
  truncated?: boolean;
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '');
}

/**
 * Garante que o contexto caiba no limite descartando, em ordem, as partes mais
 * volumosas e menos essenciais. Recebe um contexto já sanitizado.
 */
export function limitContextSize(
  context: ErrorLogContext,
  maxBytes = MAX_CONTEXT_BYTES,
): ErrorLogContext {
  if (byteSize(context) <= maxBytes) {
    return context;
  }

  context.truncated = true;

  const reducers: Array<() => void> = [
    () => {
      if (context.request?.body !== undefined) {
        context.request.body = TRUNCATED;
      }
    },
    () => {
      if (Array.isArray(context.prismaOperations)) {
        for (const operation of context.prismaOperations) {
          operation.args = TRUNCATED;
        }
      }
    },
    () => {
      if (context.responseBody !== undefined) {
        context.responseBody = TRUNCATED;
      }
    },
    () => {
      if (context.extra !== undefined) {
        context.extra = TRUNCATED;
      }
      if (context.cause !== undefined) {
        context.cause = TRUNCATED;
      }
    },
    () => {
      if (context.request) {
        context.request.query = TRUNCATED;
        context.request.params = TRUNCATED;
      }
      if (context.prisma?.meta !== undefined) {
        context.prisma.meta = TRUNCATED;
      }
    },
    () => {
      if (context.stack) {
        context.stack = truncateString(
          context.stack,
          MAX_TRUNCATED_STACK_LENGTH,
        );
      }
    },
  ];

  for (const reduce of reducers) {
    reduce();
    if (byteSize(context) <= maxBytes) {
      return context;
    }
  }

  return {
    truncated: true,
    stack: context.stack
      ? truncateString(context.stack, MAX_TRUNCATED_STACK_LENGTH)
      : undefined,
    runtime: context.runtime,
  };
}
