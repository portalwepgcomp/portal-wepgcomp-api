import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);

    RequestContext.run(
      {
        requestId,
        startedAt: Date.now(),
        request,
        prismaOperations: [],
      },
      next,
    );
  }
}
