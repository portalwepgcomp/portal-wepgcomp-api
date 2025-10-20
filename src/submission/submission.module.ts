import { Module } from '@nestjs/common';
import { UploadsModule } from 'src/uploads/uploads.module';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';

@Module({
  controllers: [SubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
  imports: [UploadsModule],
})
export class SubmissionModule {}
