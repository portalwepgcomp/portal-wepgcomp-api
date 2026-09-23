import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly storagePath = join(process.cwd(), 'storage');

  private assertSafeFilename(filename: string) {
    if (
      !filename ||
      filename.trim() === '' ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..')
    ) {
      throw new BadRequestException('Nome de arquivo inválido.');
    }
  }

  uploadFile(file: Express.Multer.File) {
    this.logger.log(`Arquivo recebido: ${file.filename}`);
    return {
      message: 'Arquivo enviado com sucesso!',
      key: file.filename,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  deleteFile(filename: string) {
    this.assertSafeFilename(filename);

    const filePath = join(this.storagePath, filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) {
        throw new BadRequestException(
          'O caminho especificado não é um arquivo.',
        );
      }

      unlinkSync(filePath);
      this.logger.log(`Arquivo deletado: ${filename}`);
      return {
        success: true,
        message: 'Arquivo deletado com sucesso!',
      };
    } catch {
      throw new InternalServerErrorException(
        'Erro interno ao tentar deletar o arquivo.',
      );
    }
  }

  listFiles() {
    if (!existsSync(this.storagePath)) {
      return [];
    }

    try {
      const filenames = readdirSync(this.storagePath);
      return filenames.map((filename) => {
        let sizeMB = 'N/A';
        try {
          const stats = statSync(join(this.storagePath, filename));
          if (stats.isFile()) {
            sizeMB = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
          }
        } catch {
          sizeMB = 'Erro';
        }
        return {
          filename,
          sizeMB,
        };
      });
    } catch {
      throw new InternalServerErrorException(
        'Não foi possível listar os arquivos.',
      );
    }
  }

  downloadFile(filename: string, res: Response) {
    this.assertSafeFilename(filename);

    const filePath = join(this.storagePath, filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const file = createReadStream(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    file.on('error', (erro: NodeJS.ErrnoException) => {
      this.logger.error(`Falha ao ler o arquivo ${filename}`, erro?.stack);

      if (res.headersSent) {
        res.destroy(erro);
        return;
      }

      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');

      const status = erro?.code === 'ENOENT' ? 404 : 500;
      res.status(status).json({
        statusCode: status,
        message:
          status === 404
            ? 'Arquivo não encontrado.'
            : 'Não foi possível ler o arquivo.',
      });
    });

    file.pipe(res);
  }
}
