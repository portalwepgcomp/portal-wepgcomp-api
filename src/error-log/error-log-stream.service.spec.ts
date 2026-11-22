import { MessageEvent } from '@nestjs/common';
import {
  ErrorLogStreamService,
  HEARTBEAT_INTERVAL_MS,
} from './error-log-stream.service';

describe('ErrorLogStreamService', () => {
  let service: ErrorLogStreamService;
  const createdAt = new Date('2026-11-21T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-21T12:00:00.000Z') });
    service = new ErrorLogStreamService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  function collect(expiresAt?: Date) {
    const messages: MessageEvent[] = [];
    let completed = false;
    const subscription = service.connect(expiresAt).subscribe({
      next: (message) => messages.push(message),
      complete: () => (completed = true),
    });
    return { messages, subscription, isCompleted: () => completed };
  }

  it('abre com ready e repassa os registros publicados', () => {
    const { messages, subscription } = collect();

    service.publish({ id: 'log-1', createdAt, route: '/submission/:id' });

    expect(messages).toEqual([
      { type: 'ready', data: { heartbeatMs: HEARTBEAT_INTERVAL_MS } },
      { type: 'error-log', id: 'log-1', data: { id: 'log-1', createdAt } },
    ]);
    subscription.unsubscribe();
  });

  it('não repassa rota nem path da própria consulta de logs', () => {
    const { messages, subscription } = collect();

    service.publish({ id: 'a', createdAt, route: '/error-logs/:id' });
    service.publish({ id: 'b', createdAt, path: '/error-logs/stream' });
    service.publish({ id: 'c', createdAt, route: null, path: null });

    expect(messages.map((message) => message.id)).toEqual([undefined, 'c']);
    subscription.unsubscribe();
  });

  it('envia ping como comentário no intervalo do heartbeat', () => {
    const { messages, subscription } = collect();

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);

    expect(messages.slice(1)).toEqual([
      { comment: 'ping' },
      { comment: 'ping' },
    ]);
    subscription.unsubscribe();
  });

  it('encerra quando o token expira', () => {
    const { isCompleted } = collect(new Date(Date.now() + 60_000));

    jest.advanceTimersByTime(59_999);
    expect(isCompleted()).toBe(false);
    jest.advanceTimersByTime(1);
    expect(isCompleted()).toBe(true);
  });

  it('para de emitir depois que o módulo é destruído', () => {
    const { messages, subscription } = collect();

    service.onModuleDestroy();
    service.publish({ id: 'tarde', createdAt });

    expect(messages.some((message) => message.id === 'tarde')).toBe(false);
    subscription.unsubscribe();
  });
});
