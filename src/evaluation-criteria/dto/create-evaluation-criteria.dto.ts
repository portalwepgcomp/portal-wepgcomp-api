import { OmitType } from '@nestjs/swagger';
import { UpdateEvaluationCriteriaDto } from './update-evaluation-criteria.dto';

export class CreateEvaluationCriteriaDto extends OmitType(
  UpdateEvaluationCriteriaDto,
  ['id'] as const,
) {}
