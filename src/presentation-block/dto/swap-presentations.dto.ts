import { IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class SwapPresentationsDto {
  @IsUUID()
  presentation1Id: string;
  @IsUUID()
  presentation2Id: string;
}

export class SwapMultiplePresentationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SwapPresentationsDto)
  presentations: SwapPresentationsDto[];
}
