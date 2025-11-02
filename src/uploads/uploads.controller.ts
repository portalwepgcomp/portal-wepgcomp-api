import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ProfileAccessGuard } from 'src/auth/guards/profile-access.guard';
import { UserLevelGuard } from 'src/auth/guards/user-level.guard';

@Controller('uploads')
@UseGuards(JwtAuthGuard, UserLevelGuard, ProfileAccessGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: join(process.cwd(), 'storage'),
      filename: (req, file, cb) => {
        const safe = formatArchiveName(file.originalname);
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

function formatArchiveName(name: string): string {
  if (!name) return `arquivo_${Date.now()}.pdf`;

  const extension = extname(name).toLowerCase();
  let baseName = name.substring(0, name.length - extension.length);

  baseName = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');

  return `${baseName.toLowerCase()}${extension}`;
}