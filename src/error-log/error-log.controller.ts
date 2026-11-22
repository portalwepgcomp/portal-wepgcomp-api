import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserLevel } from '@prisma/client';
import { UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import {
  ErrorLogQueryDto,
  ErrorLogSummaryQueryDto,
} from './dto/error-log-query.dto';
import { ErrorLogQueryService } from './error-log-query.service';

@ApiTags('error-logs')
@ApiBearerAuth()
@Controller('error-logs')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class ErrorLogController {
  constructor(private readonly errorLogQueryService: ErrorLogQueryService) {}

  @Get()
  @UserLevels(UserLevel.Admin)
  list(@Query() query: ErrorLogQueryDto) {
    return this.errorLogQueryService.list(query);
  }

  @Get('summary')
  @UserLevels(UserLevel.Admin)
  summary(@Query() query: ErrorLogSummaryQueryDto) {
    return this.errorLogQueryService.summary(query);
  }

  @Get(':id')
  @UserLevels(UserLevel.Admin)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.errorLogQueryService.findOne(id);
  }
}
