import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { fileValidationPipe, multerOptions } from './config/multer.options';
import { diskStorage } from 'multer';

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', {
  storage: diskStorage({
    destination: './storage',
    filename: (req, file, cb) => {
      const safe = tratarNomeArquivo(file.originalname || `arquivo${extname(file.originalname || '.pdf')}`);
      cb(null, safe);
    },
  }),
}))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Faz upload de um arquivo PDF' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Arquivo carregado com sucesso!' })
  @ApiResponse({
    status: 400,
    description: 'Arquivo inválido (tamanho ou tipo).',
  })
  uploadFile(@UploadedFile(fileValidationPipe) file: Express.Multer.File) {
    return {
      message: 'Arquivo enviado com sucesso!',
      key: file.filename,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      url: `/uploads/${file.filename}`,
    };
  }

  @Delete(':filename')
  @ApiOperation({ summary: 'Deleta um arquivo pelo nome do arquivo' })
  @ApiResponse({ status: 200, description: 'Arquivo deletado com sucesso!' })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado.' })
  deleteFile(@Param('filename') filename: string) {
    const filePath = join(__dirname, '..', '..', 'storage', filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return { message: 'Arquivo deletado com sucesso!' };
    }
    throw new NotFoundException('Arquivo não encontrado.');
  }

  @Get(':filename')
  getFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(__dirname, '..', '..', 'storage', filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    const file = createReadStream(filePath);
    file.pipe(res);
  }
}

function tratarNomeArquivo(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
}