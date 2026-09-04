import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePresentationBlockDto } from './create-presentation-block.dto';

export class UpdatePresentationBlockDto extends PartialType(
  OmitType(CreatePresentationBlockDto, ['eventEditionId'] as const),
) {}
