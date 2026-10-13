import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Profile, Subprofile } from '@prisma/client';
import { IsEnum, ValidateIf } from 'class-validator';

export class RequestProfileChangeDto {
  @ApiProperty({ enum: Profile, example: Profile.Presenter })
  @IsEnum(Profile)
  profile: Profile;

  @ApiPropertyOptional({
    enum: Subprofile,
    description: 'Obrigatório quando o perfil pedido é Listener.',
  })
  @ValidateIf((dto) => dto.profile === Profile.Listener)
  @IsEnum(Subprofile, {
    message: 'Informe o tipo de ouvinte (subprofile).',
  })
  subprofile?: Subprofile;
}
