import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { SubmissionValidatorService } from './submission-validator.service';

@Module({
  controllers: [SubmissionController],
  providers: [SubmissionService, SubmissionValidatorService],
  exports: [SubmissionService, SubmissionValidatorService],
  imports: [UploadsModule],
})
export class SubmissionModule {}
