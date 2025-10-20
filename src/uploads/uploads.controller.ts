import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
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
import { UserLevel } from '@prisma/client';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { UserLevels } from 'src/auth/decorators/user-level.decorator';
import { fileValidationPipe } from './config/multer.options';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  private readonly storagePath = join(process.cwd(), 'storage');

  @Post()
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(process.cwd(), 'storage'),
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
    return this.uploadsService.uploadFile(file);
  }

  @Delete(':filename')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  @ApiOperation({ summary: 'Deleta um arquivo pelo nome do arquivo' })
  @ApiResponse({ status: 200, description: 'Arquivo deletado com sucesso!' })
  @ApiResponse({ status: 404, description: 'Arquivo não encontrado.' })
  deleteFile(@Param('filename') filename: string) {
    return this.uploadsService.deleteFile(filename);
  }

  @Get('list')
  @UserLevels(UserLevel.Superadmin)
  @ApiOperation({ summary: 'Lista os nomes dos arquivos armazenados' })
  @ApiResponse({ status: 200, description: 'Lista de arquivos retornada.' })
  listFiles() {
    return this.uploadsService.listFiles();
  }

  @Get(':filename')
  getFile(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.getFile(filename, res);
  }
}

function tratarNomeArquivo(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
}
