import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Profile, UserLevel } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public, UserLevels } from '../auth/decorators/user-level.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import { AppException } from '../exceptions/app.exception';
import {
  CreateProfessorByAdminDto,
  CreateUserDto,
  SetAdminDto,
} from './dto/create-user.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Public()
  @Post('register')
  async create(@Body() createUserDto: CreateUserDto) {
    return await this.userService.create(createUserDto);
  }

  @Post('create-professor')
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Criar professor por super administrador',
    description:
      'Permite que um super administrador crie um novo professor sem senha. Um email será enviado com credenciais temporárias.',
  })
  @ApiResponse({
    status: 201,
    description: 'Professor criado com sucesso',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          description: 'Dados do usuário criado',
        },
        temporaryPassword: {
          type: 'string',
          description:
            'Senha temporária gerada (para casos onde o email falha)',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou email/matrícula já existem',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário não tem permissões de super administrador',
  })
  async createProfessor(
    @Body() createProfessorDto: CreateProfessorByAdminDto,
    @CurrentUser() currentUser: any,
  ) {
    return await this.userService.createProfessorByAdmin(
      createProfessorDto,
      currentUser.userId,
    );
  }

  @Post('set-default')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin)
  @ApiBearerAuth()
  async setDefault(@Body() setDefaultDto: SetAdminDto) {
    return await this.userService.setDefault(setDefaultDto);
  }

  @Post('set-admin')
  @UserLevels(UserLevel.Superadmin, UserLevel.Admin)
  @ApiBearerAuth()
  async setAdmin(@Body() setAdminDto: SetAdminDto) {
    return await this.userService.setAdmin(setAdminDto);
  }

  @Post('set-super-admin')
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async setSuperAdmin(@Body() setAdminDto: SetAdminDto) {
    return await this.userService.setSuperAdmin(setAdminDto);
  }

  @Delete('delete/:id')
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return await this.userService.remove(id);
  }

  @Patch('toggle-activation/:id')
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  @ApiQuery({
    name: 'activate',
    required: true,
    description: 'Activate or deactivate the user.',
  })
  @ApiTags('Users')
  async toggleUserActivation(
    @Param('id') id: string,
    @Query('activate') activate: boolean,
  ) {
    if (activate === undefined) {
      throw new AppException('O campo "activate" é obrigatório.', 400);
    }

    return this.userService.toggleUserActivation(id, activate);
  }

  // --- ENHANCED ROLE MANAGEMENT ENDPOINTS ---

  /**
   * Approves a user with the PROFESSOR role.
   * Only accessible by users with ADMIN or SUPERADMIN roles.
   * @param id - The ID of the user to be approved.
   */
  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Admin, UserLevel.Superadmin)
  @ApiBearerAuth()
  async approveTeacher(@Param('id') id: string) {
    const result = await this.userService.approveTeacher(id);
    return new ResponseUserDto(result);
  }

  /**
   * Approves a user with the PRESENTER role.
   * Only accessible by users with ADMIN or SUPERADMIN roles.
   * @param id - The ID of the user to be approved.
   */
  @Patch(':id/approve-presenter')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Admin, UserLevel.Superadmin)
  @ApiBearerAuth()
  async approvePresenter(@Param('id') id: string) {
    const result = await this.userService.approvePresenter(id);
    return new ResponseUserDto(result);
  }

  /**
   * Promotes an approved teacher to ADMIN.
   * Only accessible by users who are SUPERADMINs.
   * @param id - The ID of the user to be promoted to admin.
   */
  @Patch(':id/promote-admin')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async promoteToAdmin(@Param('id') id: string) {
    const result = await this.userService.promoteToAdmin(id);
    return new ResponseUserDto(result);
  }

  /**
   * Promotes an admin to SUPERADMIN.
   * Only accessible by users who are already SUPERADMINs.
   * @param id - The ID of the user to be promoted to superadmin.
   */
  @Patch(':id/promote-superadmin')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async promoteToSuperadmin(@Param('id') id: string) {
    const result = await this.userService.promoteToSuperadmin(id);
    return new ResponseUserDto(result);
  }

  /**
   * Demotes a user from their current admin role.
   * Only accessible by users who are SUPERADMINs.
   * @param id - The ID of the user to be demoted.
   */
  @Patch(':id/demote')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async demoteUser(@Param('id') id: string) {
    const result = await this.userService.demoteUser(id);
    return new ResponseUserDto(result);
  }

  /**
   * Demotes a user to a specific level in the hierarchy.
   * Only accessible by users who are SUPERADMINs.
   * @param id - The ID of the user to be demoted.
   * @param targetLevel - The target level (default, teacher, admin).
   */
  @Patch(':id/demote-to/:targetLevel')
  @UseGuards(JwtAuthGuard, UserLevelGuard)
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async demoteUserToLevel(
    @Param('id') id: string,
    @Param('targetLevel') targetLevel: 'default' | 'teacher' | 'admin',
  ) {
    const result = await this.userService.demoteUserToLevel(id, targetLevel);
    return new ResponseUserDto(result);
  }

  @Get()
  @ApiQuery({
    name: 'roles',
    required: false,
    description:
      'Filter by user levels (e.g., Admin, Default). Accepts multiple values.',
  })
  @ApiQuery({
    name: 'profiles',
    required: false,
    description:
      'Filter by profiles (e.g., Professor, Listener). Accepts multiple values.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by user status (e.g., Active, Inactive).',
  })
  @UserLevels(UserLevel.Default, UserLevel.Admin, UserLevel.Superadmin)
  @ApiBearerAuth()
  async getUsers(
    @Query('roles') roles?: string | string[],
    @Query('profiles') profiles?: string | string[],
    @Query('status') status?: string,
  ) {
    const toArray = (input?: string | string[]): string[] => {
      if (!input) return [];
      if (Array.isArray(input)) return input;
      return input.split(',').map((value) => value.trim());
    };

    const rolesArray = roles ? toArray(roles) : undefined;
    const profilesArray = profiles ? toArray(profiles) : undefined;

    return await this.userService.findAll(rolesArray, profilesArray, status);
  }

  @Get('advisors')
  @UserLevels(UserLevel.Default, UserLevel.Admin, UserLevel.Superadmin)
  @ApiBearerAuth()
  async getAdvisors() {
    return await this.userService.findAll(undefined, Profile.Professor);
  }

  @Get('admins')
  @UserLevels(UserLevel.Default, UserLevel.Admin, UserLevel.Superadmin)
  @ApiBearerAuth()
  async getAdmins() {
    return await this.userService.findAll(
      [UserLevel.Superadmin, UserLevel.Admin],
      undefined,
    );
  }

  @Post('confirm-email')
  async confirmEmail(
    @Query('token') token: string,
  ): Promise<{ message: string }> {
    const confirmed = await this.userService.confirmEmail(token);
    if (confirmed) {
      return { message: 'E-mail confirmado com sucesso.' };
    } else {
      throw new AppException(
        'Falha ao confirmar o e-mail.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch('edit/:email')
  @UserLevels(UserLevel.Superadmin)
  @ApiBearerAuth()
  async editUserBySuperAdmin(
    @Param('email') rawEmail: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request & { user: any }
  ) {
    const email = this.parseEmailParam(rawEmail);
    this.validateUpdateData(updateUserDto);

    return await this.userService.editUserBySuperAdmin(email, updateUserDto, req.user.email);
  }

  private parseEmailParam(rawEmail: string): string {
    try {
      return decodeURIComponent(rawEmail);
    } catch (error) {
      throw new BadRequestException('Email inválido no parâmetro da URL.');
    }
  }
  private validateUpdateData(updateUserDto: UpdateUserDto): void {
    const hasData = Object.values(updateUserDto).some(value => value !== undefined);
    if (!hasData) {
      throw new BadRequestException('Nenhum campo fornecido para atualização.');
    }
  }


}
