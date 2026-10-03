import { PresentationService } from './presentation.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionService } from '../submission/submission.service';
import { PresentationBookmarkService } from './presentation-bookmark.service';
import { PresentationScoringService } from './presentation-scoring.service';
import { AppException } from '../exceptions/app.exception';

describe('PresentationService - reservas de sessões', () => {
  let service: PresentationService;
  let tx: any;
  let prisma: any;

  const createDto = {
    submissionId: 'submission-b',
    presentationBlockId: 'block-1',
    positionWithinBlock: 0,
  };
  const existing = {
    id: 'presentation-b',
    ...createDto,
    status: 'ToPresent',
  };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      presentation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(existing),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'new', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...existing, ...data })),
      },
      submission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-b',
          eventEditionId: 'edition-1',
          status: 'Confirmed',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      presentationBlock: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'block-1',
          eventEditionId: 'edition-1',
          type: 'Presentation',
          duration: 10,
        }),
      },
      eventEdition: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'edition-1',
          presentationDuration: 10,
        }),
      },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      presentation: tx.presentation,
    };
    service = new PresentationService(
      prisma as PrismaService,
      {} as SubmissionService,
      {} as PresentationBookmarkService,
      {} as PresentationScoringService,
    );
  });

  it('não aloca nem confirma um trabalho na última vaga reservada por outro', async () => {
    tx.submission.count.mockResolvedValue(1);
    tx.submission.findUnique.mockResolvedValue({
      id: 'submission-b',
      eventEditionId: 'edition-1',
      status: 'Submitted',
    });

    await expect(service.create(createDto)).rejects.toThrow(
      new AppException('A sessão escolhida não possui vagas disponíveis.', 409),
    );
    expect(tx.presentation.create).not.toHaveBeenCalled();
    expect(tx.submission.update).not.toHaveBeenCalled();
  });

  it('converte a própria reserva em apresentação, sem contar o trabalho duas vezes', async () => {
    tx.submission.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id?.not === 'submission-b' ? 0 : 1),
    );

    await expect(service.create(createDto)).resolves.toMatchObject(createDto);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain(
      'presentation_block',
    );
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(tx.submission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { not: 'submission-b' },
        Presentation: { none: {} },
      }),
    });
  });

  it('confirma a submissão dentro da transação de alocação bem-sucedida', async () => {
    tx.submission.findUnique.mockResolvedValue({
      id: 'submission-b',
      eventEditionId: 'edition-1',
      status: 'Submitted',
    });

    await service.create(createDto);
    expect(tx.submission.update).toHaveBeenCalledWith({
      where: { id: 'submission-b' },
      data: { status: 'Confirmed' },
    });
  });

  it('respeita uma reserva de posição zero mesmo quando há outra vaga livre', async () => {
    tx.presentationBlock.findUnique.mockResolvedValue({
      id: 'block-1',
      eventEditionId: 'edition-1',
      type: 'Presentation',
      duration: 20,
    });
    tx.submission.findFirst.mockResolvedValue({ id: 'submission-a' });

    await expect(service.create(createDto)).rejects.toThrow(
      new AppException('A posição escolhida já está reservada.', 409),
    );
    expect(tx.presentation.create).not.toHaveBeenCalled();
  });

  it('não move uma apresentação para uma sessão reservada por outro trabalho', async () => {
    tx.submission.count.mockResolvedValue(1);

    await expect(
      service.update(existing.id, {
        presentationBlockId: 'block-1',
      }),
    ).rejects.toThrow(
      new AppException('A sessão escolhida não possui vagas disponíveis.', 409),
    );
    expect(tx.presentation.update).not.toHaveBeenCalled();
  });

  it('mantém a apresentação na própria sessão cheia', async () => {
    tx.presentation.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id?.not === existing.id ? 0 : 1),
    );

    await expect(
      service.update(existing.id, {
        positionWithinBlock: 0,
      }),
    ).resolves.toMatchObject(existing);
    expect(tx.presentation.count).toHaveBeenCalledWith({
      where: {
        presentationBlockId: 'block-1',
        submissionId: { not: 'submission-b' },
        id: { not: existing.id },
      },
    });
  });

  it('permite substituir o trabalho alocado por outro que já reservou a sessão', async () => {
    tx.presentation.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id?.not === existing.id ? 0 : 1),
    );
    tx.submission.count.mockImplementation(({ where }: any) =>
      Promise.resolve(
        tx.presentation.update.mock.calls.length > 0 ||
          where.id?.not === 'submission-c'
          ? 0
          : 1,
      ),
    );

    await expect(
      service.update(existing.id, {
        submissionId: 'submission-c',
      }),
    ).resolves.toMatchObject({ submissionId: 'submission-c' });
  });

  it('desfaz a troca de trabalho que reativa uma proposta além da capacidade', async () => {
    tx.presentation.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id?.not === existing.id ? 0 : 1),
    );
    tx.submission.count.mockImplementation(() =>
      Promise.resolve(tx.presentation.update.mock.calls.length > 0 ? 1 : 0),
    );

    await expect(
      service.update(existing.id, {
        submissionId: 'submission-c',
      }),
    ).rejects.toThrow(
      new AppException('A sessão escolhida não possui vagas disponíveis.', 409),
    );
  });
  it('verifica colisões ao editar para a posição zero sem informar a sessão', async () => {
    tx.presentation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'another-presentation' });

    await expect(
      service.update(existing.id, {
        positionWithinBlock: 0,
      }),
    ).rejects.toThrow(
      new AppException('Posição de apresentação já ocupada.', 400),
    );
  });

  it('valida a posição atual ao trocar de sessão sem enviar uma nova posição', async () => {
    tx.presentation.findUnique.mockResolvedValue({
      ...existing,
      positionWithinBlock: 1,
    });

    await expect(
      service.update(existing.id, {
        presentationBlockId: 'block-1',
      }),
    ).rejects.toThrow(
      new AppException('Posição de apresentação inválida.', 400),
    );
  });

  it('a rota do próprio autor também respeita as reservas', async () => {
    tx.presentation.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id ? existing : null),
    );
    tx.submission.count.mockResolvedValue(1);

    await expect(
      service.updatePresentationForUser('user-b', existing.id, {
        presentationBlockId: 'block-1',
      }),
    ).rejects.toThrow(
      new AppException('A sessão escolhida não possui vagas disponíveis.', 409),
    );
  });

  it('rejeita alocação em outra edição', async () => {
    tx.submission.findUnique.mockResolvedValue({
      id: 'submission-b',
      eventEditionId: 'edition-2',
      status: 'Confirmed',
    });
    await expect(service.create(createDto)).rejects.toThrow(
      new AppException(
        'A sessão escolhida pertence a outra edição do evento.',
        400,
      ),
    );
  });

  it('rejeita alocação em sessão geral', async () => {
    tx.presentationBlock.findUnique.mockResolvedValue({
      id: 'block-1',
      eventEditionId: 'edition-1',
      type: 'General',
      duration: 10,
    });
    await expect(service.create(createDto)).rejects.toThrow(
      new AppException('A sessão escolhida não é de apresentação.', 400),
    );
  });
});
