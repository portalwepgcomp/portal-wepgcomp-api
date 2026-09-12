import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventEditionService } from './event-edition.service';
import {
  CreateEventEditionDto,
  CreateFromEventEditionFormDto,
} from './dto/create-event-edition.dto';
import {
  UpdateEventEditionDto,
  UpdateFromEventEditionFormDto,
} from './dto/update-event-edition.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserLevelGuard } from '../auth/guards/user-level.guard';
import { UserLevel } from '@prisma/client';
import { Public, UserLevels } from '../auth/decorators/user-level.decorator';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EventEditionResponseDto } from './dto/event-edition-response';

@Controller('event')
@UseGuards(JwtAuthGuard, UserLevelGuard)
export class EventEditionController {
  constructor(private readonly eventEditionService: EventEditionService) {}

  @Post()
  @UserLevels(UserLevel.Admin)
  @ApiBearerAuth()
  async create(@Body() createEventDto: CreateEventEditionDto) {
    return await this.eventEditionService.create(createEventDto);
  }

  @Post('/create-from-event-edition-form')
  @UserLevels(UserLevel.Admin)
  @ApiBearerAuth()
  async createFromEventEditionForm(
    @Body()
    createFromEventEditionFormDto: CreateFromEventEditionFormDto,
  ): Promise<EventEditionResponseDto> {
    return await this.eventEditionService.createFromEventEditionForm(
      createFromEventEditionFormDto,
    );
  }

  @Put('/update-from-event-edition-form/:id')
  @UserLevels(UserLevel.Admin)
  async updateFromEventEditionForm(
    @Param('id') id: string,
    @Body()
    updateFromEventEditionFormDto: UpdateFromEventEditionFormDto,
  ): Promise<EventEditionResponseDto> {
    return await this.eventEditionService.updateFromEventEditionForm(
      id,
      updateFromEventEditionFormDto,
    );
  }

  @Public()
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'paginated', required: false, type: Boolean })
  async getAll(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('paginated') paginated?: boolean,
  ) {
    return await this.eventEditionService.getAll(
      search,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
      paginated !== undefined ? String(paginated) === 'true' : undefined,
    );
  }

  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.eventEditionService.getById(id);
  }

  @Public()
  @Get('year/:year')
  async getByYear(@Param('year') year: number) {
    return await this.eventEditionService.getByYear(year);
  }

  @Put(':id')
  @UserLevels(UserLevel.Admin)
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @Body() updateEventRequestDTO: UpdateEventEditionDto,
  ) {
    return await this.eventEditionService.update(id, updateEventRequestDTO);
  }

  @Patch('active/:id')
  @UserLevels(UserLevel.Admin)
  @ApiBearerAuth()
  async setActive(@Param('id') id: string) {
    return await this.eventEditionService.setActive(id);
  }

  @Delete(':id')
  @UserLevels(UserLevel.Admin)
  @ApiBearerAuth()
  async delete(@Param('id') id: string) {
    return await this.eventEditionService.delete(id);
  }

  @Post('/remove-admins-from-ended-events')
  async removeAdminsFromEvent() {
    return await this.eventEditionService.removeAdminsFromEndedEvents();
  }
}
