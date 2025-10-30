import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { UserLevel } from '@prisma/client';
import { UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileAccessGuard } from '../auth/guards/profile-access.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import {
  CreateSubmissionDto
} from './dto/create-submission.dto';
import { ResponseSubmissionDto } from './dto/response-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionService } from './submission.service';

@Controller('submission')
@UseGuards(JwtAuthGuard, UserLevelGuard, ProfileAccessGuard)
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) { }

  @Post()
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  create(@Body() createSubmissionDto: CreateSubmissionDto) {
    return this.submissionService.create(createSubmissionDto);
  }

  @Get()
  @ApiQuery({ name: 'eventEditionId', required: true, type: String })
  @ApiQuery({ name: 'withoutPresentation', required: false, type: Boolean })
  @ApiQuery({
    name: 'orderByProposedPresentation',
    required: false,
    type: Boolean,
  })
  @ApiQuery({ name: 'showConfirmedOnly', required: false, type: Boolean })
  findAll(
    @Query('eventEditionId') eventEditionId: string,
    @Query('withoutPresentation') withoutPresentation: boolean = false,
    @Query('orderByProposedPresentation')
    orderByProposedPresentation: boolean = false,
    @Query('showConfirmedOnly') showConfirmedOnly: boolean = false,
    @Query('mainAuthorId') mainAuthorId?: string,
  ): Promise<ResponseSubmissionDto[]> {
    return this.submissionService.findAll(
      eventEditionId,
      withoutPresentation,
      orderByProposedPresentation,
      showConfirmedOnly,
      mainAuthorId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.submissionService.findOne(id);
  }

  @Patch(':id')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  update(
    @Param('id') id: string,
    @Body() updateSubmissionDto: UpdateSubmissionDto,
  ) {
    return this.submissionService.update(id, updateSubmissionDto);
  }

  @Delete(':id')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin, UserLevel.Default)
  remove(@Param('id') id: string) {
    return this.submissionService.remove(id);
  }
}
