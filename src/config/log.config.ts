import { LoggerService } from '@nestjs/common';

export class SimpleLogger implements LoggerService {
  error(message: any) {
    if (message instanceof Error) {
       console.error('ERROR:', message.message); 
    } else {
       console.error('ERROR:', message);
    }
  }
  log(message: any) { console.log(message); }
  warn(message: any) { console.warn(message); }
}
