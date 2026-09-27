import { EventEmitter } from 'events';
import * as fs from 'fs';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Response } from 'express';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let service: UploadsService;
  let storageTemp: string;

  function fakeRes() {
    const res: Record<string, unknown> = {
      headersSent: false,
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
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

  function streamQueFalha(codigo?: string) {
    const stream = new EventEmitter() as EventEmitter & {
      pipe: jest.Mock;
    };
    stream.pipe = jest.fn();

    const erro: NodeJS.ErrnoException = new Error('falha de leitura');
    erro.code = codigo;
    setImmediate(() => stream.emit('error', erro));

    return stream as unknown as fs.ReadStream;
  }

  const aguardarStream = () =>
    new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

  beforeEach(() => {
    storageTemp = mkdtempSync(join(tmpdir(), 'wepgcomp-uploads-'));
    service = new UploadsService();
    Object.defineProperty(service, 'storagePath', { value: storageTemp });
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(storageTemp, { recursive: true, force: true });
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
      writeFileSync(join(storageTemp, 'slides.pdf'), '%PDF-1.4');
      jest
        .spyOn(fs, 'createReadStream')
        .mockReturnValue(streamQueFalha('EACCES'));

      const res = fakeRes();
      const uncaught = jest.fn();
      process.once('uncaughtException', uncaught);

      service.downloadFile('slides.pdf', res);
      await aguardarStream();

      process.removeListener('uncaughtException', uncaught);

      expect(uncaught).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('deve responder 404 quando o arquivo some entre a checagem e a leitura', async () => {
      writeFileSync(join(storageTemp, 'slides.pdf'), '%PDF-1.4');
      jest
        .spyOn(fs, 'createReadStream')
        .mockReturnValue(streamQueFalha('ENOENT'));

      const res = fakeRes();
      service.downloadFile('slides.pdf', res);
      await aguardarStream();

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deve limpar os cabeçalhos de PDF antes de responder o erro em JSON', async () => {
      writeFileSync(join(storageTemp, 'slides.pdf'), '%PDF-1.4');
      jest
        .spyOn(fs, 'createReadStream')
        .mockReturnValue(streamQueFalha('EACCES'));

      const res = fakeRes();
      service.downloadFile('slides.pdf', res);
      await aguardarStream();

      expect(res.removeHeader).toHaveBeenCalledWith('Content-Type');
      expect(res.removeHeader).toHaveBeenCalledWith('Content-Disposition');
    });

    it('deve encerrar a resposta em vez de responder quando o stream já começou', async () => {
      writeFileSync(join(storageTemp, 'slides.pdf'), '%PDF-1.4');
      jest
        .spyOn(fs, 'createReadStream')
        .mockReturnValue(streamQueFalha('EACCES'));

      const res = fakeRes();
      (res as unknown as { headersSent: boolean }).headersSent = true;

      service.downloadFile('slides.pdf', res);
      await aguardarStream();

      expect(res.destroy).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
