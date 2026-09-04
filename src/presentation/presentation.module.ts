import { Module } from '@nestjs/common';
import { PresentationService } from './presentation.service';
import { PresentationController } from './presentation.controller';
import { SubmissionModule } from '../submission/submission.module';
import { ScoringModule } from '../scoring/scoring.module';
import { PresentationBookmarkService } from './presentation-bookmark.service';
import { PresentationScoringService } from './presentation-scoring.service';

@Module({
  controllers: [PresentationController],
  providers: [
    PresentationService,
    PresentationBookmarkService,
    PresentationScoringService,
  ],
  imports: [SubmissionModule, ScoringModule],
  exports: [
    PresentationService,
    PresentationBookmarkService,
    PresentationScoringService,
  ],
})
export class PresentationModule {}
