import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { RequestContext } from '../common/request-context/request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, originalUrl } = request;
    const now = Date.now();

    RequestContext.setHandler(
      context.getClass().name,
      context.getHandler().name,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const response = ctx.getResponse<Response>();
          const statusCode = response.statusCode;
          const delay = Date.now() - now;
          this.logger.log(
            `${method} ${originalUrl} ${statusCode} - ${delay}ms`,
          );
        },
        error: (error) => {
          const delay = Date.now() - now;
          const status = error?.status || error?.statusCode || 500;
          this.logger.error(
            `${method} ${originalUrl} ${status} - ${delay}ms - ${error?.message || error}`,
          );
        },
      }),
    );
  }
}
