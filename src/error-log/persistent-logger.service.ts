import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';

/** Contextos já persistidos pelo filtro HTTP ou que gerariam loop. */
export const IGNORED_LOGGER_CONTEXTS = new Set([
  'HttpExceptionFilter',
  'HTTP',
  'ErrorLogService',
]);

const SCHEDULER_CONTEXT = 'Scheduler';
const STACK_HEADLINE_NAME = /^([A-Za-z_$][\w$]*)(?::|$)/;

/**
 * Logger da aplicação: imprime como o `ConsoleLogger` e persiste toda chamada
 * de `error()` (services, crons do `@nestjs/schedule`) na tabela `error_log`.
 */
@Injectable()
export class PersistentLogger extends ConsoleLogger {
  constructor(private readonly errorLogService: ErrorLogService) {
    super();
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);

    if (!this.isLevelEnabled('error')) {
      return;
    }

    try {
      this.persist([message, ...optionalParams]);
    } catch (persistError) {
      console.error(
        '[PersistentLogger] Falha ao preparar log de erro:',
        persistError instanceof Error ? persistError.message : persistError,
      );
    }
  }

  private persist(args: unknown[]): void {
    const { messages, context, stack } =
      this.getContextAndStackAndMessagesToPrint(args);

    if (context && IGNORED_LOGGER_CONTEXTS.has(context)) {
      return;
    }

    const error = messages.find((item): item is Error => item instanceof Error);
    const text = messages
      .filter((item): item is string => typeof item === 'string')
      .join(' ');
    const stackString = typeof stack === 'string' ? stack : undefined;

    void this.errorLogService.record({
      source: context === SCHEDULER_CONTEXT ? 'cron' : 'logger',
      level: 'error',
      error: error ?? text,
      message: text || undefined,
      stack: stackString ?? error?.stack ?? this.callerStack(),
      exceptionName: error ? undefined : this.nameFromStack(stackString),
      loggerContext: context,
      extra: stackString
        ? { originalError: stackString.split('\n')[0] }
        : undefined,
    });
  }

  /** Stack de quem chamou o logger, para saber onde o erro foi registrado. */
  private callerStack(): string | undefined {
    const holder: { stack?: string } = {};
    Error.captureStackTrace(holder, PersistentLogger.prototype.error);
    return holder.stack;
  }

  private nameFromStack(stack?: string): string {
    const headline = stack?.split('\n')[0]?.trim() ?? '';
    return STACK_HEADLINE_NAME.exec(headline)?.[1] ?? 'LoggerMessage';
  }
}
