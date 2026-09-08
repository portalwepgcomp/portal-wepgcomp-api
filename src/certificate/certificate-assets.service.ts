import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CertificateAssetsService {
  private readonly logger = new Logger(CertificateAssetsService.name);
  private readonly assetsDir = path.resolve(process.cwd(), 'public', 'assets');
  private readonly fontCache = new Map<string, Buffer>();
  private readonly imageCache = new Map<string, Buffer>();

  private readonly fontFiles: Record<string, string> = {
    regular: 'SourceSerif4-Regular.ttf',
    bold: 'SourceSerif4-Bold.ttf',
    semibold: 'SourceSerif4-SemiBold.ttf',
    italic: 'SourceSerif4-Italic.ttf',
    medium: 'SourceSerif4-Medium.ttf',
    bolditalic: 'SourceSerif4-BoldItalic.ttf',
  };

  private readonly imageFiles: Record<string, string> = {
    'pgcomp_ufba_logo.png': 'pgcomp_ufba_logo.png',
    'brasao-ufba-low-res.png': 'brasao-ufba-low-res.png',
    'brasao-ufba.png': 'brasao-ufba.png',
    'frederico-araujo-durao-signature': 'frederico-araujo-durao-signature.png',
    'frederico-araujo-durao-signature.png':
      'frederico-araujo-durao-signature.png',
    'mock-signature.png': 'mock-signature.png',
  };

  getFontBuffer(fontType: string): Buffer {
    if (this.fontCache.has(fontType)) {
      return this.fontCache.get(fontType)!;
    }
    const fileName = this.fontFiles[fontType] || `${fontType}.ttf`;
    const filePath = path.join(this.assetsDir, fileName);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      this.fontCache.set(fontType, buffer);
      return buffer;
    }
    this.logger.warn(`Arquivo de fonte não encontrado: ${filePath}`);
    return Buffer.from('');
  }

  getImageBuffer(imageKey: string): Buffer {
    if (this.imageCache.has(imageKey)) {
      return this.imageCache.get(imageKey)!;
    }
    const fileName = this.imageFiles[imageKey] || imageKey;
    const filePath = path.join(this.assetsDir, fileName);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      this.imageCache.set(imageKey, buffer);
      return buffer;
    }
    this.logger.warn(`Arquivo de imagem não encontrado: ${filePath}`);
    return Buffer.from('');
  }
}
