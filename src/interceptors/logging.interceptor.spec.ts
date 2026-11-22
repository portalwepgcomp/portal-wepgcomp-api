import { CallHandler, ExecutionContext, Logger, Sse } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

class StubController {
  list() {
    return [];
  }

  @Sse('stream')
  stream() {
    return of();
  }
}

function contextFor(handler: () => unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/error-logs/stream' }),
      getResponse: () => ({ statusCode: 200 }),
    }),
    getClass: () => StubController,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

const emitting = (...values: unknown[]): CallHandler => ({
  handle: () => of(...values),
});

describe('LoggingInterceptor', () => {
  let log: jest.SpyInstance;
  const interceptor = new LoggingInterceptor();

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra cada resposta de handlers comuns', async () => {
    await lastValueFrom(
      interceptor.intercept(
        contextFor(StubController.prototype.list),
        emitting([]),
      ),
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^GET \/error-logs\/stream 200 - /);
  });

  it('em SSE registra só abertura e encerramento, não cada mensagem', async () => {
    await lastValueFrom(
      interceptor.intercept(
        contextFor(StubController.prototype.stream),
        emitting({ comment: 'ping' }, { comment: 'ping' }, { type: 'x' }),
      ),
    );

    expect(log.mock.calls.map(([message]) => message)).toEqual([
      'GET /error-logs/stream stream aberto',
      expect.stringMatching(/^GET \/error-logs\/stream stream encerrado - /),
    ]);
  });
});
