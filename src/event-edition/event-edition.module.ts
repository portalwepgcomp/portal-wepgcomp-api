import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { EventEditionCommitteeService } from './event-edition-committee.service';
import { EventEditionController } from './event-edition.controller';
import { EventEditionService } from './event-edition.service';

@Module({
  controllers: [EventEditionController],
  providers: [EventEditionService, EventEditionCommitteeService],
  exports: [EventEditionService, EventEditionCommitteeService],
  imports: [ScoringModule],
})
export class EventEditionModule {}
