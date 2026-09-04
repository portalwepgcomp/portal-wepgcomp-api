import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AwardedPresentersModule } from './awarded-presenters/awarded-presenters.module';
import { AwardedPanelistsModule } from './awarded-panelists/awarded-panelists.module';
import { CertificateModule } from './certificate/certificate.module';
import { CommitteeMemberModule } from './committee-member/committee-member.module';
import { EvaluationCriteriaModule } from './evaluation-criteria/evaluation-criteria.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { EventEditionModule } from './event-edition/event-edition.module';
import { GuidanceModule } from './guidance/guidance.module';
import { MailingModule } from './mailing/mailing.module';
import { PresentationBlockModule } from './presentation-block/presentation-block.module';
import { PresentationModule } from './presentation/presentation.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoomModule } from './room/room.module';
import { ScoringModule } from './scoring/scoring.module';
import { SubmissionModule } from './submission/submission.module';
import { UploadsModule } from './uploads/uploads.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    PrismaModule,
    ConfigModule.forRoot(),
    EventEditionModule,
    MailingModule,
    ScheduleModule.forRoot(),
    PresentationModule,
    SubmissionModule,
    PresentationBlockModule,
    CommitteeMemberModule,
    EvaluationModule,
    RoomModule,
    GuidanceModule,
    AwardedPanelistsModule,
    AwardedPresentersModule,
    EvaluationCriteriaModule,
    CertificateModule,
    ScoringModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
