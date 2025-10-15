import { Module } from '@nestjs/common';
import { AwardedPresentersService } from './awarded-presenters.service';
import { AwardedPresentersController } from './awarded-presenters.controller';

@Module({
  controllers: [AwardedPresentersController],
  providers: [AwardedPresentersService],
})
export class AwardedPresentersModule {}
