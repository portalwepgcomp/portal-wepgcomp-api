import {
  Controller,
  Get,
  Headers,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserLevel } from '@prisma/client';
import { Observable } from 'rxjs';
import { UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import {
  ErrorLogQueryDto,
  ErrorLogSummaryQueryDto,
} from './dto/error-log-query.dto';
import { ErrorLogQueryService } from './error-log-query.service';
import { ErrorLogStreamService } from './error-log-stream.service';

@ApiTags('error-logs')
@ApiBearerAuth()
@Controller('error-logs')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class ErrorLogController {
  constructor(
    private readonly errorLogQueryService: ErrorLogQueryService,
    private readonly errorLogStreamService: ErrorLogStreamService,
    private readonly jwtService: JwtService,
  ) {}

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

  /** Declarado antes de `:id`, senão o `ParseUUIDPipe` recusa "stream". */
  @Sse('stream')
  @UserLevels(UserLevel.Admin)
  stream(
    @Headers('authorization') authorization?: string,
  ): Observable<MessageEvent> {
    return this.errorLogStreamService.connect(
      this.tokenExpiresAt(authorization),
    );
  }

  @Get(':id')
  @UserLevels(UserLevel.Admin)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.errorLogQueryService.findOne(id);
  }

  /** O guard já validou a assinatura; aqui só interessa o `exp`. */
  private tokenExpiresAt(authorization?: string): Date | undefined {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : undefined;
    const payload = token
      ? this.jwtService.decode<{ exp?: number } | null>(token)
      : null;
    return typeof payload?.exp === 'number'
      ? new Date(payload.exp * 1000)
      : undefined;
  }
}
