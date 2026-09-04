import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './exceptions/filter';

function resolveCorsOrigins(): string[] | boolean {
  // CORS_ORIGINS aceita uma lista separada por vírgula; cai para FRONTEND_URL.
  const raw = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Sem configuração explícita: libera tudo apenas fora de produção.
  if (origins.length === 0) {
    return process.env.NODE_ENV === 'production' ? false : true;
  }

  return origins;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.use(helmet());

  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // Remove campos não declarados nos DTOs. forbidNonWhitelisted foi
      // mantido desligado de propósito: vários DTOs ainda estão incompletos e
      // o front pode enviar campos extras; rejeitar com 400 quebraria fluxos.
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
