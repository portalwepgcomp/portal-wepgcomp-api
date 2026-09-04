import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserLevel } from '@prisma/client';
import { Public, UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import {
  ContactRequestDto,
  ContactResponseDto,
  DefaultEmailDto,
  DefaultEmailResponseDto,
  SendGroupEmailDto,
} from './mailing.dto';
import { MailingService } from './mailing.service';

@Controller('mailing')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class MailingController {
  constructor(private readonly mailingService: MailingService) { }

  @Post('/contact')
  @Public()
  async contact(
    @Body() contactDto: ContactRequestDto,
  ): Promise<ContactResponseDto> {
    return await this.mailingService.contact(contactDto);
  }

  @Post('/send')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin)
  @ApiBearerAuth()
  async send(
    @Body() sendDto: DefaultEmailDto,
  ): Promise<DefaultEmailResponseDto> {
    return await this.mailingService.sendEmail(sendDto);
  }

  @Post('send-group')
  @UserLevels(UserLevel.Superadmin)
  @HttpCode(HttpStatus.OK)
  async sendGroupEmail(@Body() sendGroupEmailDto: SendGroupEmailDto) {
    return this.mailingService.sendGroupEmail(sendGroupEmailDto);
  }
}
