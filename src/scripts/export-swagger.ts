import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';

async function exportSwagger() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('WEPGCOMP API')
      .setDescription('Portal WEPGCOMP - API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    const outputPath = path.resolve(__dirname, '../../openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

    console.log(`[Swagger] OpenAPI JSON salvo em: ${outputPath}`);
    process.exit(0);
  } catch (err) {
    console.error('[Swagger] Erro ao exportar Swagger OpenAPI:', err);
    process.exit(1);
  }
}

exportSwagger();
