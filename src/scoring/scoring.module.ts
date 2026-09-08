import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ScoringCalculatorService } from './scoring-calculator.service';

@Module({
  providers: [ScoringService, ScoringCalculatorService],
  exports: [ScoringService, ScoringCalculatorService],
})
export class ScoringModule {}
