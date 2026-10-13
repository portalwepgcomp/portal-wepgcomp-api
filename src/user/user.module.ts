import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailingModule } from '../mailing/mailing.module';
import { UserAdminService } from './user-admin.service';
import { UserProfileChangeService } from './user-profile-change.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserVerificationService } from './user-verification.service';

@Module({
  controllers: [UserController],
  providers: [
    UserService,
    UserVerificationService,
    UserAdminService,
    UserProfileChangeService,
  ],
  exports: [UserService, UserVerificationService, UserAdminService],
  imports: [MailingModule, HttpModule],
})
export class UserModule {}
