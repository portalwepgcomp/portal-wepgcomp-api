import { FileValidator } from '@nestjs/common';
import { extname } from 'path';

export class PdfFileValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    
    const isValidMimeType = file.mimetype === 'application/pdf';
    
    const fileExtension = extname(file.originalname).toLowerCase();
    const isValidExtension = fileExtension === '.pdf';
    
    return isValidMimeType && isValidExtension;
  }

  buildErrorMessage(): string {
    return 'Apenas arquivos PDF são permitidos';
  }
}

