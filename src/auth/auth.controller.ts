import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto, SignInDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  async resetPassword(
    @Query('token') token: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(token, resetPasswordDto.newPassword);
  }

  @Get('generate-token/:userId')
  generateToken(@Param('userId') userId: string) {
    return this.authService.generateToken(userId);
  }

  @Get('validate-token')
  async validateToken(@Headers('authorization') authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const token = authorization.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    return this.authService.validateToken(token);
  }
}
