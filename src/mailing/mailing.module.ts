import { forwardRef, Module } from '@nestjs/common';
import { MailingService } from './mailing.service';
import { MailingController } from './mailing.controller';
import { EventEditionModule } from '../event-edition/event-edition.module';
import { CommitteeMemberModule } from '../committee-member/committee-member.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [EventEditionModule, CommitteeMemberModule],
  controllers: [MailingController],
  providers: [MailingService],
  exports: [MailingService],
})
export class MailingModule {}
