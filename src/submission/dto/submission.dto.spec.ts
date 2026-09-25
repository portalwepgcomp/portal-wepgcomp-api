import { ValidationPipe } from '@nestjs/common';
import { UpdateSubmissionDto } from './update-submission.dto';

describe('Submission DTOs', () => {
  const validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('accepts writable fields and rejects response-only fields on update', async () => {
    await expect(
      validationPipe.transform(
        { abstractText: 'Abstract atualizado com conteúdo válido.' },
        { type: 'body', metatype: UpdateSubmissionDto },
      ),
    ).resolves.toBeInstanceOf(UpdateSubmissionDto);

    await expect(
      validationPipe.transform(
        {
          abstract: 'Campo de resposta que não pode ser enviado.',
        },
        { type: 'body', metatype: UpdateSubmissionDto },
      ),
    ).rejects.toThrow('Bad Request Exception');
  });
});
