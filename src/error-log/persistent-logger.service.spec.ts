import { ConsoleLogger, Logger } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';
import { PersistentLogger } from './persistent-logger.service';

describe('PersistentLogger', () => {
  let errorLogService: { record: jest.Mock };
  let logger: PersistentLogger;

  beforeEach(() => {
    errorLogService = { record: jest.fn().mockResolvedValue(undefined) };
    logger = new PersistentLogger(
      errorLogService as unknown as ErrorLogService,
    );
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    Logger.overrideLogger(logger);
  });

  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
    jest.restoreAllMocks();
  });

  it('grava falhas de cron registradas pelo Scheduler como source cron', () => {
    const error = new Error('Database Error');

    new Logger('Scheduler').error(error);

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron',
        level: 'error',
        error,
        stack: error.stack,
        loggerContext: 'Scheduler',
      }),
    );
  });

  it('grava logger.error de services com mensagem e stack original', () => {
    const original = new Error('connect ECONNREFUSED');

    new Logger('MailingService').error('Falha ao enviar email', original.stack);

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'logger',
        message: 'Falha ao enviar email',
        stack: original.stack,
        exceptionName: 'Error',
        loggerContext: 'MailingService',
        extra: { originalError: 'Error: connect ECONNREFUSED' },
      }),
    );
  });

  it('sem stack, registra a stack de quem chamou o logger', () => {
    new Logger('ScoringService').error('Falha ao calcular notas');

    const input = errorLogService.record.mock.calls[0][0];
    expect(input.exceptionName).toBe('LoggerMessage');
    expect(input.stack).toContain('persistent-logger.service.spec.ts');
    expect(input.stack).not.toContain('PersistentLogger.error');
  });

  it.each(['HttpExceptionFilter', 'HTTP', 'ErrorLogService'])(
    'ignora o contexto %s',
    (context) => {
      new Logger(context).error('qualquer');

      expect(errorLogService.record).not.toHaveBeenCalled();
    },
  );

  it('não persiste log, warn nem debug', () => {
    const scoped = new Logger('X');
    scoped.log('a');
    scoped.warn('b');
    scoped.debug('c');

    expect(errorLogService.record).not.toHaveBeenCalled();
  });

  it('não lança nem entra em loop quando a gravação falha', () => {
    errorLogService.record.mockImplementation(() => {
      throw new Error('falhou');
    });
    jest.spyOn(console, 'error').mockImplementation();

    expect(() => new Logger('X').error('boom')).not.toThrow();
    expect(errorLogService.record).toHaveBeenCalledTimes(1);
  });
});
