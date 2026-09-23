import { IsBoolean } from 'class-validator';

export class UpdateRegistrationOpenDto {
  @IsBoolean()
  registrationOpen: boolean;
}
