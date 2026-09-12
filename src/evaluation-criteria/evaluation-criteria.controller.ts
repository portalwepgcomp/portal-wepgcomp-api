import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserLevel } from '@prisma/client';
import { UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import { EvaluationCriteriaService } from './evaluation-criteria.service';
import { CreateEvaluationCriteriaDto } from './dto/create-evaluation-criteria.dto';
import { UpdateEvaluationCriteriaDto } from './dto/update-evaluation-criteria.dto';

@Controller('evaluation-criteria')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class EvaluationCriteriaController {
  constructor(
    private readonly evaluationCriteriaService: EvaluationCriteriaService,
  ) {}

  @Get(':eventEditionId')
  @UserLevels(UserLevel.Default, UserLevel.Admin)
  async findAll(@Param('eventEditionId') eventEditionId: string) {
    return await this.evaluationCriteriaService.findAll(eventEditionId);
  }

  @Post('batch')
  @UserLevels(UserLevel.Admin)
  async createFromList(
    @Body() evaluationCriteria: CreateEvaluationCriteriaDto[],
  ) {
    return await this.evaluationCriteriaService.createFromList(
      evaluationCriteria,
    );
  }

  @Put('batch')
  @UserLevels(UserLevel.Admin)
  async editFromList(
    @Body() evaluationCriteria: UpdateEvaluationCriteriaDto[],
  ) {
    return await this.evaluationCriteriaService.editFromList(
      evaluationCriteria,
    );
  }
}
