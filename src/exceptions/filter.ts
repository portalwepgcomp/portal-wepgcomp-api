import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    // Log no servidor sem expor o objeto inteiro (que poderia conter payloads
    // sensíveis). Erros 5xx registram a stack para diagnóstico.
    const logContext = `${request?.method ?? '-'} ${request?.url ?? '-'}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${logContext} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      const description =
        exception instanceof Error ? exception.message : 'Erro tratado';
      this.logger.warn(`${logContext} -> ${status}: ${description}`);
    }

    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : { message: exceptionResponse ?? 'Erro interno no servidor' };

    response.status(status).json({
      statusCode: status,
      ...body,
    });
  }
}
