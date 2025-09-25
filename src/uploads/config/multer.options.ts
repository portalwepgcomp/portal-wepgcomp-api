import { MaxFileSizeValidator, ParseFilePipe } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PdfFileValidator } from './validator';

const MAX_FILE_SIZE_BYTES = 11200000; // 11.2 MB

export const multerOptions = {
  storage: diskStorage({
    destination: './storage',
    filename: (req, file, callback) => {
      const uniqueSuffix = uuidv4() + extname(file.originalname);
      callback(null, uniqueSuffix);
    },
  }),
};


export const fileValidationPipe = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES }),
    new PdfFileValidator(),
  ],
});