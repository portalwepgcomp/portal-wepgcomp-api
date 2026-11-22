import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  MAX_TRACKED_PRISMA_OPERATIONS,
  RequestContext,
  RequestContextStore,
} from '../common/request-context/request-context';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rastreamento de operações por requisição', () => {
    let tracker: Prisma.Middleware;

    beforeEach(() => {
      const useSpy = jest.spyOn(PrismaClient.prototype, '$use');
      new PrismaService();
      tracker = useSpy.mock.calls[1][0];
      useSpy.mockRestore();
    });

    const params = (model: string, action: string): Prisma.MiddlewareParams =>
      ({
        model,
        action,
        args: { where: { id: '1' } },
        dataPath: [],
        runInTransaction: false,
      }) as unknown as Prisma.MiddlewareParams;

    const createStore = (): RequestContextStore => ({
      requestId: 'req',
      startedAt: Date.now(),
      request: {} as never,
      prismaOperations: [],
    });

    it('registra sucesso e falha sem alterar resultado nem erro', async () => {
      const store = createStore();
      const failure = new Error('db');

      await RequestContext.run(store, async () => {
        await expect(
          tracker(params('User', 'findUnique'), async () => 'ok'),
        ).resolves.toBe('ok');
        await expect(
          tracker(params('User', 'update'), async () => {
            throw failure;
          }),
        ).rejects.toBe(failure);
      });

      expect(store.prismaOperations).toEqual([
        expect.objectContaining({
          model: 'User',
          action: 'findUnique',
          failed: false,
        }),
        expect.objectContaining({
          model: 'User',
          action: 'update',
          failed: true,
          args: { where: { id: '1' } },
        }),
      ]);
    });

    it('mantém só as últimas operações', async () => {
      const store = createStore();

      await RequestContext.run(store, async () => {
        for (let i = 0; i < MAX_TRACKED_PRISMA_OPERATIONS + 3; i++) {
          await tracker(params('User', `op${i}`), async () => null);
        }
      });

      expect(store.prismaOperations).toHaveLength(
        MAX_TRACKED_PRISMA_OPERATIONS,
      );
      expect(store.prismaOperations[0].action).toBe('op3');
    });

    it('ignora operações fora de requisição e na própria tabela de log', async () => {
      const store = createStore();
      const next = jest.fn().mockResolvedValue(null);

      await tracker(params('User', 'findMany'), next);
      await RequestContext.run(store, () =>
        tracker(params('ErrorLog', 'create'), next),
      );

      expect(next).toHaveBeenCalledTimes(2);
      expect(store.prismaOperations).toEqual([]);
    });
  });
});
