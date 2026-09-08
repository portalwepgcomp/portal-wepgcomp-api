import { PartialType } from '@nestjs/swagger';
import { CreatePresentationWithSubmissionDto } from './create-presentation-with-submission.dto';

export class UpdatePresentationWithSubmissionDto extends PartialType(
  CreatePresentationWithSubmissionDto,
) {}
