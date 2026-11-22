import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContext } from '../common/request-context/request-context';
import { ErrorLogService } from '../error-log/error-log.service';

// Em serverless a função pode congelar logo após a resposta, então o registro é
// aguardado antes de responder, com teto para não segurar o cliente.
const PERSIST_TIMEOUT_MS = 1500;

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly errorLogService: ErrorLogService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
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

    await this.errorLogService.recordWithTimeout(
      {
        source: 'http',
        level: status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'error' : 'warn',
        error: exception,
        statusCode: status,
        responseBody: body,
        loggerContext: HttpExceptionFilter.name,
        request,
      },
      PERSIST_TIMEOUT_MS,
    );

    if (response.headersSent) {
      return;
    }

    response.status(status).json({
      statusCode: status,
      ...body,
      requestId: RequestContext.get()?.requestId,
    });
  }
}
