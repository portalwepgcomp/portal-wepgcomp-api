import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './exceptions/filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableCors({
    origin: '*',
    methods: '*',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,            
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT || 3000, "0.0.0.0");
}
bootstrap();
