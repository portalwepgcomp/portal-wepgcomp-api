import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserLevel } from '@prisma/client'; // Enum gerado pelo Prisma
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserLevelGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredLevels = this.reflector.get<UserLevel[]>(
      'levels',
      context.getHandler(),
    );
    if (!requiredLevels) {
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
        level: true,
        isActive: true,
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

    if (!requiredLevels.includes(userData.level)) {
      throw new ForbiddenException('Acesso negado: permissões insuficientes');
    }

    return true;
  }
}
