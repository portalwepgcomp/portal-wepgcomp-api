import 'dotenv/config';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { REQUEST_ID_HEADER } from './common/request-context/request-context.middleware';
import { ErrorLogService } from './error-log/error-log.service';
import { PersistentLogger } from './error-log/persistent-logger.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

const PROCESS_ERROR_PERSIST_TIMEOUT_MS = 2000;

type ValidationDetail = {
  field: string;
  messages: string[];
};

function collectValidationDetails(
  errors: ValidationError[],
  parentField = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parentField
      ? `${parentField}.${error.property}`
      : error.property;
    const ownDetails = Object.values(error.constraints ?? {}).map(
      (message) => ({
        field,
        messages: [message],
      }),
    );
    const childDetails = collectValidationDetails(error.children ?? [], field);

    return [...ownDetails, ...childDetails];
  });
}

function resolveCorsOrigins(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  return (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const raw =
      process.env.CORS_ORIGINS ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000,http://127.0.0.1:3000';
    const allowed = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (
      allowed.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      process.env.NODE_ENV !== 'production'
    ) {
      return callback(null, true);
    }

    return callback(new Error('Bloqueado pela política de CORS.'), false);
  };
}

/**
 * Registra a falha e encerra o processo, preservando o comportamento padrão do
 * Node (o processo cai e o orquestrador reinicia).
 */
function registerProcessErrorHandlers(errorLogService: ErrorLogService) {
  let exiting = false;

  const handle = (kind: string) => async (error: unknown) => {
    if (exiting) {
      return;
    }
    exiting = true;
    console.error(`[${kind}]`, error);
    await errorLogService.recordWithTimeout(
      {
        source: 'process',
        level: 'error',
        error,
        loggerContext: kind,
      },
      PROCESS_ERROR_PERSIST_TIMEOUT_MS,
    );
    process.exit(1);
  };

  process.on('unhandledRejection', handle('unhandledRejection'));
  process.on('uncaughtException', handle('uncaughtException'));
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(PersistentLogger);
  logger.setLogLevels(['log', 'error', 'warn', 'debug']);
  app.useLogger(logger);

  app.use(helmet());

  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      REQUEST_ID_HEADER,
    ],
    exposedHeaders: [REQUEST_ID_HEADER],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // Remove campos não declarados nos DTOs (sem rejeitar a request).
      whitelist: true,
      // TODO(emergencial): reativar `forbidNonWhitelisted: true` quando o front
      // deixar de reenviar campos extras nos PATCH (ex.: eventEditionId em
      // sessão; ...submission em apresentação). Vários fluxos quebram com
      // "property X should not exist" enquanto isso.
      forbidNonWhitelisted: false,
      exceptionFactory: (errors) => {
        const details = collectValidationDetails(errors);

        return new BadRequestException({
          error: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details,
        });
      },
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('WEPGCOMP API')
    .setDescription('Portal WEPGCOMP - API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT || 3000, '0.0.0.0');

  registerProcessErrorHandlers(app.get(ErrorLogService));
}
bootstrap();
