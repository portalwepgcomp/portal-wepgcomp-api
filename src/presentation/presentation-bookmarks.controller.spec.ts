import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PresentationController } from './presentation.controller';
import { PresentationService } from './presentation.service';

describe('GET /presentation/bookmarks', () => {
  const userId = '00000005-0000-4000-8000-010000000000';
  const eventEditionId = '00000005-0000-4000-8000-020000002025';
  const secret = 'bookmarks-controller-test-secret';
  const bookmarkedPresentations = jest.fn();
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [PresentationController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: PresentationService, useValue: { bookmarkedPresentations } },
        {
          provide: PrismaService,
          useValue: {
            userAccount: {
              findUnique: jest.fn().mockResolvedValue({
                id: userId,
                level: 'Default',
                isActive: true,
              }),
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    token = module.get(JwtService).sign({ userId });
  });

  beforeEach(() => {
    bookmarkedPresentations
      .mockReset()
      .mockResolvedValue({ bookmarkedPresentations: [] });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('passes the authenticated user and requested edition to the service', async () => {
    const response = {
      bookmarkedPresentations: [
        { id: 'presentation1', submission: { eventEditionId } },
      ],
    };
    bookmarkedPresentations.mockResolvedValue(response);
    await request(app.getHttpServer())
      .get('/presentation/bookmarks')
      .auth(token, { type: 'bearer' })
      .query({ eventEditionId })
      .expect(200, response);
    expect(bookmarkedPresentations).toHaveBeenCalledWith(
      userId,
      eventEditionId,
    );
  });

  it('returns the empty envelope for an edition without bookmarks', async () => {
    await request(app.getHttpServer())
      .get('/presentation/bookmarks')
      .auth(token, { type: 'bearer' })
      .query({ eventEditionId })
      .expect(200, { bookmarkedPresentations: [] });
  });

  it.each([
    {},
    { eventEditionId: '' },
    { eventEditionId: '2025' },
    { eventEditionId: [eventEditionId, eventEditionId] },
    { eventEditionId, userId: 'another-user' },
  ])('rejects invalid query %j before reading bookmarks', async (query) => {
    await request(app.getHttpServer())
      .get('/presentation/bookmarks')
      .auth(token, { type: 'bearer' })
      .query(query)
      .expect(400);
    expect(bookmarkedPresentations).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/presentation/bookmarks')
      .query({ eventEditionId })
      .expect(401);
    expect(bookmarkedPresentations).not.toHaveBeenCalled();
  });

  it('documents eventEditionId as a required UUID query parameter', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      document.paths['/presentation/bookmarks'].get?.parameters,
    ).toContainEqual(
      expect.objectContaining({
        name: 'eventEditionId',
        in: 'query',
        required: true,
        schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
      }),
    );
  });
});
