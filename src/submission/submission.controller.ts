import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { UserLevel } from '@prisma/client';
import { Response } from 'express';
import { UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileAccessGuard } from '../auth/guards/profile-access.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionService } from './submission.service';

@Controller('submission')
@UseGuards(JwtAuthGuard, UserLevelGuard, ProfileAccessGuard)
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post()
  @UserLevels(UserLevel.Admin, UserLevel.Default)
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
  @ApiQuery({ name: 'mainAuthorId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'paginated', required: false, type: Boolean })
  findAll(
    @Request() req: any,
    @Query('eventEditionId') eventEditionId: string,
    @Query('withoutPresentation') withoutPresentation: boolean = false,
    @Query('orderByProposedPresentation')
    orderByProposedPresentation: boolean = false,
    @Query('showConfirmedOnly') showConfirmedOnly: boolean = false,
    @Query('mainAuthorId') mainAuthorId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('paginated') paginated?: boolean,
  ) {
    return this.submissionService.findAll(
      eventEditionId,
      withoutPresentation,
      orderByProposedPresentation,
      showConfirmedOnly,
      mainAuthorId,
      search,
      req.user,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
      paginated !== undefined ? String(paginated) === 'true' : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.submissionService.findOne(id);
  }

  @Get(':id/pdf')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Baixa o PDF de uma submissão' })
  @ApiParam({
    name: 'id',
    description: 'ID da submissão associada ao PDF',
    format: 'uuid',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description: 'PDF retornado com sucesso.',
    content: { 'application/pdf': {} },
  })
  @ApiResponse({ status: 401, description: 'Usuário não autenticado.' })
  @ApiResponse({ status: 404, description: 'Submissão ou PDF não encontrado.' })
  downloadPdf(@Param('id') id: string, @Res() res: Response) {
    return this.submissionService.downloadPdf(id, res);
  }

  @Patch(':id')
  @UserLevels(UserLevel.Admin, UserLevel.Default)
  update(
    @Param('id') id: string,
    @Body() updateSubmissionDto: UpdateSubmissionDto,
  ) {
    return this.submissionService.update(id, updateSubmissionDto);
  }

  @Delete(':id')
  @UserLevels(UserLevel.Admin, UserLevel.Default)
  remove(@Param('id') id: string) {
    return this.submissionService.remove(id);
  }
}
