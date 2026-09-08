import { Module } from '@nestjs/common';
import { MailingService } from './mailing.service';
import { MailingController } from './mailing.controller';
import { MailingTemplateService } from './mailing-template.service';
import { EventEditionModule } from '../event-edition/event-edition.module';
import { CommitteeMemberModule } from '../committee-member/committee-member.module';

@Module({
  imports: [EventEditionModule, CommitteeMemberModule],
  controllers: [MailingController],
  providers: [MailingService, MailingTemplateService],
  exports: [MailingService, MailingTemplateService],
})
export class MailingModule {}
