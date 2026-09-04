import { Test, TestingModule } from '@nestjs/testing';
import { AwardedPresentersController } from './awarded-presenters.controller';
import { AwardedPresentersService } from './awarded-presenters.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AwardedPresentersController', () => {
  let controller: AwardedPresentersController;

  beforeEach(async () => {
    const mockPrismaService = {
      awardedPresenters: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockAwardedPresentersService = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AwardedPresentersController],
      providers: [
        {
          provide: AwardedPresentersService,
          useValue: mockAwardedPresentersService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<AwardedPresentersController>(
      AwardedPresentersController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
