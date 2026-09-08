import { IsEmail, IsString } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;
  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  newPassword: string;
}
