import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../common/request-context/request-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    this.$use(async (params, next) => {
      if (params.action === 'findMany') {
        if (params.args && params.args.select && !params.args.orderBy) {
          if (params.args.select.name) {
            params.args.orderBy = { name: 'asc' };
          }
        }
      }
      return next(params);
    });

    // Guarda as últimas operações da requisição para o registro de falhas.
    // Os args são sanitizados só quando um erro é persistido.
    this.$use(async (params, next) => {
      if (!RequestContext.get() || params.model === 'ErrorLog') {
        return next(params);
      }

      const startedAt = Date.now();
      try {
        const result = await next(params);
        RequestContext.trackPrismaOperation({
          model: params.model,
          action: params.action,
          args: params.args,
          durationMs: Date.now() - startedAt,
          failed: false,
        });
        return result;
      } catch (error) {
        RequestContext.trackPrismaOperation({
          model: params.model,
          action: params.action,
          args: params.args,
          durationMs: Date.now() - startedAt,
          failed: true,
        });
        throw error;
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
