import {
  PresentationBlockType,
  Prisma,
  Submission,
  SubmissionStatus,
} from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { availableSubmissionSlots } from '../presentation-block/presentation-block-availability';
import { SubmissionValidatorService } from './submission-validator.service';

describe('SubmissionValidatorService - sessão proposta', () => {
  let db: PrismaService;
  let validator: SubmissionValidatorService;

  const existing = {
    id: 'submission-1',
    eventEditionId: 'edition-1',
    proposedPresentationBlockId: null,
    proposedPositionWithinBlock: null,
  } as Submission;

  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'block-1' }]),
      presentationBlock: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'block-1',
          eventEditionId: 'edition-1',
          type: PresentationBlockType.Presentation,
          duration: 20,
        }),
      },
      eventEdition: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'edition-1',
          presentationDuration: 10,
        }),
      },
      presentation: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      submission: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    validator = new SubmissionValidatorService(db);
  });

  const chooseBlock = (current: Submission = existing) =>
    validator.validateUpdate(
      current.id,
      { proposedPresentationBlockId: 'block-1' },
      current,
    );

  it('aceita uma sessão da edição com vaga e bloqueia o bloco durante a validação', async () => {
    await expect(chooseBlock()).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.submission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        proposedPresentationBlockId: 'block-1',
        status: {
          in: [SubmissionStatus.Submitted, SubmissionStatus.Confirmed],
        },
        Presentation: { none: {} },
        id: { not: 'submission-1' },
      }),
    });
  });

  it('rejeita sessão inexistente', async () => {
    (db.presentationBlock.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(chooseBlock()).rejects.toThrow(
      new AppException('Sessão de apresentação não encontrada.', 404),
    );
  });

  it('rejeita sessão de outra edição', async () => {
    (db.presentationBlock.findUnique as jest.Mock).mockResolvedValue({
      id: 'block-1',
      eventEditionId: 'edition-2',
      type: PresentationBlockType.Presentation,
      duration: 20,
    });
    await expect(chooseBlock()).rejects.toThrow(
      new AppException(
        'A sessão escolhida pertence a outra edição do evento.',
        400,
      ),
    );
  });

  it('rejeita sessão geral', async () => {
    (db.presentationBlock.findUnique as jest.Mock).mockResolvedValue({
      id: 'block-1',
      eventEditionId: 'edition-1',
      type: PresentationBlockType.General,
      duration: 20,
    });
    await expect(chooseBlock()).rejects.toThrow(
      new AppException('A sessão escolhida não é de apresentação.', 400),
    );
  });

  it('rejeita sessão cheia por alocações e propostas ativas', async () => {
    (db.presentation.count as jest.Mock).mockResolvedValue(1);
    (db.submission.count as jest.Mock).mockResolvedValue(1);
    await expect(chooseBlock()).rejects.toThrow(
      new AppException('A sessão escolhida não possui vagas disponíveis.', 409),
    );
  });

  it('permite manter a própria proposta quando todas as vagas estão reservadas', async () => {
    const current = {
      ...existing,
      proposedPresentationBlockId: 'block-1',
    } as Submission;
    (db.submission.count as jest.Mock).mockResolvedValue(1);

    await expect(chooseBlock(current)).resolves.toBeUndefined();
  });

  it('rejeita posição já solicitada por outra apresentação', async () => {
    (db.submission.findFirst as jest.Mock).mockResolvedValue({
      id: 'submission-2',
    });
    await expect(
      validator.validateUpdate(
        'submission-1',
        {
          proposedPresentationBlockId: 'block-1',
          proposedPositionWithinBlock: 0,
        },
        existing,
      ),
    ).rejects.toThrow(
      new AppException(
        'A posição escolhida já está ocupada nesta sessão.',
        409,
      ),
    );
  });

  it('rejeita posição proposta sem sessão', async () => {
    await expect(
      validator.validateUpdate(
        'submission-1',
        { proposedPositionWithinBlock: 0 },
        existing,
      ),
    ).rejects.toThrow(
      new AppException('Informe uma sessão para a posição proposta.', 400),
    );
  });

  it('expõe zero vagas para sessões gerais e desconta propostas ativas', async () => {
    const client = db as Prisma.TransactionClient;
    const block = {
      id: 'block-1',
      type: PresentationBlockType.Presentation,
      duration: 30,
    };
    (db.presentation.count as jest.Mock).mockResolvedValue(1);
    (db.submission.count as jest.Mock).mockResolvedValue(1);

    await expect(availableSubmissionSlots(client, block, 10)).resolves.toBe(1);
    await expect(
      availableSubmissionSlots(
        client,
        { ...block, type: PresentationBlockType.General },
        10,
      ),
    ).resolves.toBe(0);
  });
});
