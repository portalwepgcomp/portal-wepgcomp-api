import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import {
  interval,
  map,
  merge,
  Observable,
  startWith,
  Subject,
  takeUntil,
  timer,
} from 'rxjs';

export interface ErrorLogStreamEvent {
  id: string;
  createdAt: Date;
}

export interface PublishableErrorLog extends ErrorLogStreamEvent {
  route?: string | null;
  path?: string | null;
}

/** Abaixo do `proxy_read_timeout` padrão do nginx (60s). */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Falhas da própria consulta de logs não são publicadas: a tela que as gerou
 * recarregaria, falharia de novo e entraria em laço.
 */
const SELF_ROUTE_PREFIX = '/error-logs';

/**
 * Avisa as telas abertas de que um erro foi gravado. Em memória: só vale
 * enquanto a API roda em um único processo.
 */
@Injectable()
export class ErrorLogStreamService implements OnModuleDestroy {
  private readonly events = new Subject<ErrorLogStreamEvent>();

  publish(record: PublishableErrorLog): void {
    if (isSelfGenerated(record)) {
      return;
    }
    try {
      this.events.next({ id: record.id, createdAt: record.createdAt });
    } catch (publishError) {
      console.error(
        '[ErrorLogStreamService] Falha ao publicar log de erro:',
        publishError instanceof Error ? publishError.message : publishError,
      );
    }
  }

  /**
   * Abre com `ready` porque o Nest só envia os cabeçalhos do SSE junto com a
   * primeira mensagem; encerra em `expiresAt` para o cliente reautenticar.
   */
  connect(expiresAt?: Date): Observable<MessageEvent> {
    const stream = merge(
      this.events.pipe(
        map((event) => ({ type: 'error-log', id: event.id, data: event })),
      ),
      interval(HEARTBEAT_INTERVAL_MS).pipe(map(() => ({ comment: 'ping' }))),
    ).pipe(
      startWith({
        type: 'ready',
        data: { heartbeatMs: HEARTBEAT_INTERVAL_MS },
      }),
    );

    return expiresAt ? stream.pipe(takeUntil(timer(expiresAt))) : stream;
  }

  onModuleDestroy(): void {
    this.events.complete();
  }
}

function isSelfGenerated({ route, path }: PublishableErrorLog): boolean {
  return [route, path].some((value) => value?.startsWith(SELF_ROUTE_PREFIX));
}
