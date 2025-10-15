import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Profile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredProfiles = this.reflector.get<Profile[]>(
      'profiles',
      context.getHandler(),
    );
    if (!requiredProfiles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    // Get fresh user data from database to check current status
    const userData = await this.prismaService.userAccount.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        profile: true,
        isActive: true,
        isTeacherActive: true,
        isPresenterActive: true,
        level: true,
      },
    });

    if (!userData) {
      // Use UnauthorizedException to trigger logout instead of infinite retries
      throw new UnauthorizedException('Usuário não encontrado no sistema');
    }

    // Check if user is active
    if (!userData.isActive) {
      throw new ForbiddenException('Conta de usuário inativa');
    }

    // Check if user profile is in required profiles
    if (!requiredProfiles.includes(userData.profile)) {
      throw new ForbiddenException(
        'Acesso negado: perfil de usuário insuficiente',
      );
    }

    // Check profile-specific approval status
    if (userData.profile === Profile.Professor && !userData.isTeacherActive) {
      throw new ForbiddenException('Acesso negado: professor não aprovado');
    }

    if (userData.profile === Profile.Presenter && !userData.isPresenterActive) {
      throw new ForbiddenException('Acesso negado: apresentador não aprovado');
    }

    return true;
  }
}
