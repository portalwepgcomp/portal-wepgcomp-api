import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from '../exceptions/filter';
import { ErrorLogController } from './error-log.controller';
import { ErrorLogQueryService } from './error-log-query.service';
import { ErrorLogService } from './error-log.service';
import { PersistentLogger } from './persistent-logger.service';

@Global()
@Module({
  controllers: [ErrorLogController],
  providers: [
    ErrorLogService,
    ErrorLogQueryService,
    PersistentLogger,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [ErrorLogService, PersistentLogger],
})
export class ErrorLogModule {}
