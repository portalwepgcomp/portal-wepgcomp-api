import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { PresentationBlockAllocationService } from './presentation-block-allocation.service';
import { PresentationBlockController } from './presentation-block.controller';
import { PresentationBlockTimeService } from './presentation-block-time.service';
import { PresentationBlockService } from './presentation-block.service';

@Module({
  controllers: [PresentationBlockController],
  providers: [
    PresentationBlockService,
    PresentationBlockTimeService,
    PresentationBlockAllocationService,
  ],
  imports: [ScoringModule],
  exports: [
    PresentationBlockService,
    PresentationBlockTimeService,
    PresentationBlockAllocationService,
  ],
})
export class PresentationBlockModule {}
