import { Test, TestingModule } from '@nestjs/testing';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import { ProfileAccessGuard } from '../auth/guards/profile-access.guard';
import { Response } from 'express';

describe('SubmissionController', () => {
  let controller: SubmissionController;

  const mockSubmissionService = {
    create: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue([]),
    downloadPdf: jest.fn(),
    update: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubmissionController],
      providers: [
        {
          provide: SubmissionService,
          useValue: mockSubmissionService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserLevelGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProfileAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubmissionController>(SubmissionController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate the PDF download to the service', () => {
    const response = {} as Response;

    controller.downloadPdf('submission123', response);

    expect(service.downloadPdf).toHaveBeenCalledWith('submission123', response);
  });
});
