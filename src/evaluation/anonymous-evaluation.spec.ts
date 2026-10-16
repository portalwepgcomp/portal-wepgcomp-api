import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';

const submissionId = '00000001-0000-4000-8000-000000000099';
const criterionId = '00000002-0000-4000-8000-000000000099';
const anotherId = '00000003-0000-4000-8000-000000000099';
const userId = '00000004-0000-4000-8000-000000000099';
const secret = 'local-jest-anonymous-evaluation';

describe('Anonymous evaluations — HTTP, validation and permissions', () => {
  let app: INestApplication;
  let token: string;
  let restricted: boolean;
  let active: boolean;
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    submission: { findUnique: jest.fn() },
    presentation: { findUnique: jest.fn() },
    evaluationCriteria: { findMany: jest.fn() },
    userAccount: { findUnique: jest.fn() },
    evaluation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const body = () => ({
    name: ' Visitante ',
    email: ' VISITANTE@example.com ',
    evaluations: [
      { submissionId, evaluationCriteriaId: criterionId, score: 3 },
    ],
  });
  const edition = () => ({
    id: 'edition-99',
    name: 'Edição de teste',
    isActive: active,
    isEvaluationRestrictToLoggedUsers: restricted,
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [EvaluationController],
      providers: [
        EvaluationService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => secret } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    token = module.get(JwtService).sign({ userId, level: 'Default' });
  });
  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    restricted = false;
    active = true;
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.submission.findUnique.mockImplementation(async () => ({
      id: submissionId,
      eventEditionId: 'edition-99',
      eventEdition: edition(),
      Presentation: [{ id: 'presentation-99' }],
    }));
    prisma.presentation.findUnique.mockImplementation(async () => ({
      id: 'presentation-99',
      submission: {
        id: submissionId,
        title: 'Trabalho de teste',
        mainAuthor: { name: 'Autora' },
        eventEdition: edition(),
      },
    }));
    prisma.evaluationCriteria.findMany.mockResolvedValue([
      {
        id: criterionId,
        title: 'Qualidade',
        description: 'Qualidade da apresentação',
      },
    ]);
    prisma.userAccount.findUnique.mockResolvedValue({
      id: userId,
      level: 'Default',
      isActive: true,
    });
    prisma.evaluation.findFirst.mockResolvedValue(null);
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.evaluation.create.mockResolvedValue({ id: 'vote-99' });
    prisma.evaluation.createMany.mockResolvedValue({ count: 1 });
  });

  it('accepts visitors only on the explicit anonymous endpoint and never trusts a supplied userId', async () => {
    const payload = body();
    const response = await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send({
        ...payload,
        userId,
        evaluations: [{ ...payload.evaluations[0], userId }],
      })
      .expect(200);
    expect(response.body).toEqual({
      message: 'Avaliação realizada com sucesso.',
    });
    expect(prisma.evaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        name: 'Visitante',
        email: 'visitante@example.com',
        score: 3,
      }),
    });
    expect(prisma.userAccount.findUnique).not.toHaveBeenCalled();
  });

  it('rejects anonymous votes in restricted editions without writing anything', async () => {
    restricted = true;
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send(body())
      .expect(403);
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
    expect(prisma.evaluation.update).not.toHaveBeenCalled();
  });

  it('rejects anonymous votes in inactive editions', async () => {
    active = false;
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send(body())
      .expect(403);
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps authenticated voting working when restricted=%s',
    async (value) => {
      restricted = value;
      const evaluations = [{ ...body().evaluations[0], userId }];
      await request(app.getHttpServer())
        .put('/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(evaluations)
        .expect(200);
      expect(prisma.evaluation.createMany).toHaveBeenCalledWith({
        data: evaluations,
      });
    },
  );

  it.each([false, true])(
    'keeps private queries protected when restricted=%s',
    async (value) => {
      restricted = value;
      for (const route of [
        '/evaluations',
        '/evaluations/user',
        `/evaluations/submission/${submissionId}/final-grade`,
      ]) {
        await request(app.getHttpServer()).get(route).expect(401);
      }
      await request(app.getHttpServer())
        .put('/evaluations')
        .send(body().evaluations)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/evaluations?userId=${anotherId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(prisma.evaluation.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'returns public context without evaluations or visitor identity when restricted=%s',
    async (value) => {
      restricted = value;
      const response = await request(app.getHttpServer())
        .get('/evaluations/context/presentation-99')
        .expect(200);
      expect(response.body.eventEdition.isEvaluationRestrictToLoggedUsers).toBe(
        value,
      );
      expect(response.body.criteria).toHaveLength(value ? 0 : 1);
      expect(Object.keys(response.body).sort()).toEqual([
        'authorName',
        'criteria',
        'eventEdition',
        'presentationId',
        'submissionId',
        'title',
      ]);
      expect(prisma.evaluation.findMany).not.toHaveBeenCalled();
    },
  );

  it('updates a repeat anonymous vote without touching authenticated votes', async () => {
    prisma.evaluation.findFirst.mockResolvedValue({ id: 'previous-anonymous' });
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send(body())
      .expect(200);
    expect(prisma.evaluation.findFirst).toHaveBeenCalledWith({
      where: {
        userId: null,
        email: 'visitante@example.com',
        submissionId,
        evaluationCriteriaId: criterionId,
      },
      select: { id: true },
    });
    expect(prisma.evaluation.update).toHaveBeenCalledWith({
      where: { id: 'previous-anonymous' },
      data: expect.objectContaining({ score: 3 }),
    });
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
  });

  it.each([
    ['blank name', { name: ' ' }],
    ['invalid email', { email: 'invalid' }],
    ['empty batch', { evaluations: [] }],
    [
      'score below range',
      {
        evaluations: [
          { submissionId, evaluationCriteriaId: criterionId, score: 0 },
        ],
      },
    ],
    [
      'score above range',
      {
        evaluations: [
          { submissionId, evaluationCriteriaId: criterionId, score: 6 },
        ],
      },
    ],
    [
      'invalid criterion',
      {
        evaluations: [
          { submissionId, evaluationCriteriaId: anotherId, score: 3 },
        ],
      },
    ],
    [
      'duplicate criterion',
      {
        evaluations: [
          { submissionId, evaluationCriteriaId: criterionId, score: 3 },
          { submissionId, evaluationCriteriaId: criterionId, score: 4 },
        ],
      },
    ],
    [
      'mixed submissions',
      {
        evaluations: [
          { submissionId, evaluationCriteriaId: criterionId, score: 3 },
          {
            submissionId: anotherId,
            evaluationCriteriaId: criterionId,
            score: 4,
          },
        ],
      },
    ],
  ])('rejects %s before saving any criterion', async (_label, changes) => {
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send({ ...body(), ...changes })
      .expect(400);
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
    expect(prisma.evaluation.update).not.toHaveBeenCalled();
  });

  it('rejects incomplete criteria', async () => {
    prisma.evaluationCriteria.findMany.mockResolvedValue([
      { id: criterionId },
      { id: anotherId },
    ]);
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send(body())
      .expect(400);
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing presentation', async () => {
    prisma.presentation.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/evaluations/context/missing')
      .expect(404);
    prisma.submission.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .put('/evaluations/anonymous')
      .send(body())
      .expect(404);
  });
});
