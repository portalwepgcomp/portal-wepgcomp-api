import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
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
  private readonly storagePath = join(process.cwd(), 'storage');

  uploadFile(file: Express.Multer.File) {
    return {
      message: 'Arquivo enviado com sucesso!',
      key: file.filename,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      url: `/uploads/${file.filename}`,
    };
  }

  deleteFile(filename: string) {
    if (!filename || filename.trim() === '' || filename.includes('/') || filename.includes('..')) {
      throw new BadRequestException('Nome de arquivo inválido.');
    }

    const filePath = join(this.storagePath, filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) {
        throw new BadRequestException('O caminho especificado não é um arquivo.');
      }

      unlinkSync(filePath);
      return { 
        success: true,
        message: 'Arquivo deletado com sucesso!'
       };
    } catch (error) {
      throw new InternalServerErrorException('Erro interno ao tentar deletar o arquivo.');
    }
  }

  listFiles() {
    if (!existsSync(this.storagePath)) {
      return [];
    }

    try {
      const filenames = readdirSync(this.storagePath);
      return filenames.map(filename => {
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
          url: `/uploads/${filename}`,
        };
      });
    } catch {
      throw new InternalServerErrorException('Não foi possível listar os arquivos.');
    }
  }

  getFile(filename: string, res: Response) {
    const filePath = join(this.storagePath, filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const file = createReadStream(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    file.pipe(res);
  }
}
