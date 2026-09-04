import { PartialType } from '@nestjs/swagger';
import { CreateGuidanceDto } from './create-guidance.dto';

export class UpdateGuidanceDto extends PartialType(CreateGuidanceDto) {}
