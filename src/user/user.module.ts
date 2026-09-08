import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailingModule } from '../mailing/mailing.module';
import { UserAdminService } from './user-admin.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserVerificationService } from './user-verification.service';

@Module({
  controllers: [UserController],
  providers: [UserService, UserVerificationService, UserAdminService],
  exports: [UserService, UserVerificationService, UserAdminService],
  imports: [MailingModule, HttpModule],
})
export class UserModule {}
