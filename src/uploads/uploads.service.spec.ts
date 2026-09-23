import { existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  const storagePath = join(process.cwd(), 'storage');
  let service: UploadsService;

  function fakeRes() {
    const res: Record<string, unknown> = {
      headersSent: false,
      setHeader: jest.fn(),
      destroy: jest.fn(),
      json: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    res.status = jest.fn().mockReturnValue(res);
    return res as unknown as Response & Record<string, jest.Mock>;
  }

  beforeEach(() => {
    mkdirSync(storagePath, { recursive: true });
    service = new UploadsService();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(storagePath, { recursive: true, force: true });
  });

  describe('downloadFile', () => {
    it('deve recusar nome de arquivo com travessia de diretório', () => {
      expect(() => service.downloadFile('../../etc/passwd', fakeRes())).toThrow(
        'Nome de arquivo inválido.',
      );
    });

    it('deve responder 404 quando o arquivo não existe', () => {
      expect(() => service.downloadFile('ausente.pdf', fakeRes())).toThrow(
        'Arquivo não encontrado.',
      );
    });

    it('não deve derrubar o processo quando a leitura do arquivo falha', async () => {
      const alvo = join(storagePath, 'ilegivel.pdf');
      writeFileSync(alvo, '%PDF-1.4');
      chmodSync(alvo, 0o000);

      const res = fakeRes();
      const uncaught = jest.fn();
      process.once('uncaughtException', uncaught);

      service.downloadFile('ilegivel.pdf', res);
      await new Promise((resolve) => setTimeout(resolve, 200));

      process.removeListener('uncaughtException', uncaught);
      chmodSync(alvo, 0o644);

      expect(uncaught).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(existsSync(alvo)).toBe(true);
    });

    it('deve encerrar a resposta em vez de responder quando o stream já começou', async () => {
      const alvo = join(storagePath, 'ilegivel2.pdf');
      writeFileSync(alvo, '%PDF-1.4');
      chmodSync(alvo, 0o000);

      const res = fakeRes();
      (res as unknown as { headersSent: boolean }).headersSent = true;

      service.downloadFile('ilegivel2.pdf', res);
      await new Promise((resolve) => setTimeout(resolve, 200));

      chmodSync(alvo, 0o644);

      expect(res.destroy).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
