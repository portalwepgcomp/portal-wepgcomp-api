import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';

export const MAX_TRACKED_PRISMA_OPERATIONS = 10;

export interface PrismaOperationRecord {
  model?: string;
  action: string;
  args: unknown;
  durationMs: number;
  failed: boolean;
}

export interface RequestContextStore {
  requestId: string;
  startedAt: number;
  request: Request;
  handler?: { controller: string; method: string };
  prismaOperations: PrismaOperationRecord[];
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return storage.run(store, callback);
  },

  get(): RequestContextStore | undefined {
    return storage.getStore();
  },

  setHandler(controller: string, method: string): void {
    const store = storage.getStore();
    if (store) {
      store.handler = { controller, method };
    }
  },

  trackPrismaOperation(operation: PrismaOperationRecord): void {
    const store = storage.getStore();
    if (!store) {
      return;
    }
    store.prismaOperations.push(operation);
    if (store.prismaOperations.length > MAX_TRACKED_PRISMA_OPERATIONS) {
      store.prismaOperations.shift();
    }
  },
};
