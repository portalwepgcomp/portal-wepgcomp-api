import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommitteeLevel, CommitteeRole, Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import {
  CreateEventEditionDto,
  CreateFromEventEditionFormDto,
} from './dto/create-event-edition.dto';
import { EventEditionResponseDto } from './dto/event-edition-response';
import {
  UpdateEventEditionDto,
  UpdateFromEventEditionFormDto,
} from './dto/update-event-edition.dto';
import { PaginatedResponseDto } from '../shared/dto/paginated-response.dto';
import { EventEditionCommitteeService } from './event-edition-committee.service';

@Injectable()
export class EventEditionService {
  constructor(
    private readonly prismaClient: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly committeeService: EventEditionCommitteeService,
  ) {}

  async create(createEventEditionDto: CreateEventEditionDto) {
    return this.prismaClient.$transaction(async (prisma) => {
      const currentYear = new Date().getFullYear();

      const existingCurrentYearEvent = await prisma.eventEdition.findFirst({
        where: {
          startDate: {
            gte: new Date(`${currentYear}-01-01T00:00:00.000Z`),
            lte: new Date(`${currentYear}-12-31T23:59:59.999Z`),
          },
        },
      });

      if (existingCurrentYearEvent) {
        throw new AppException(
          `Já existe um evento criado para o ano ${currentYear}.`,
          400,
        );
      }

      const activeEvent = await prisma.eventEdition.findFirst({
        where: {
          isActive: true,
        },
        orderBy: {
          startDate: 'desc',
        },
      });

      if (activeEvent) {
        await prisma.eventEdition.update({
          where: { id: activeEvent.id },
          data: { isActive: false },
        });
      }

      const { evaluationCriteria, rooms } =
        await this.defineEvaluationCriteriaAndRooms(
          activeEvent,
          prisma,
          createEventEditionDto,
        );

      if (!createEventEditionDto.submissionStartDate) {
        createEventEditionDto.submissionStartDate = new Date();
      }
      this.validateSubmissionPeriod(createEventEditionDto);

      const createdEventEdition = await prisma.eventEdition.create({
        data: {
          name: createEventEditionDto.name,
          description: createEventEditionDto.description,
          callForPapersText:
            createEventEditionDto.callForPapersText ||
            activeEvent?.callForPapersText ||
            '',
          partnersText:
            createEventEditionDto.partnersText ||
            activeEvent?.partnersText ||
            '',
          location: createEventEditionDto.location,
          startDate: createEventEditionDto.startDate,
          endDate: createEventEditionDto.endDate,
          submissionDeadline: createEventEditionDto.submissionDeadline,
          submissionStartDate: createEventEditionDto.submissionStartDate,
          isEvaluationRestrictToLoggedUsers:
            createEventEditionDto.isEvaluationRestrictToLoggedUsers,
          presentationDuration: createEventEditionDto.presentationDuration,
          presentationsPerPresentationBlock:
            createEventEditionDto.presentationsPerPresentationBlock,
          isActive: true,
        },
      });

      // Copy evaluation criteria if they exist
      if (evaluationCriteria != null && evaluationCriteria.length > 0) {
        await Promise.all(
          evaluationCriteria.map(async (criteria) =>
            prisma.evaluationCriteria.create({
              data: {
                eventEditionId: createdEventEdition.id,
                title: criteria.title,
                description: criteria.description,
                weightRadio: criteria.weightRadio,
              },
            }),
          ),
        );
      }

      // Copy rooms if they exist
      if (rooms != null && rooms.length > 0) {
        await Promise.all(
          rooms.map(async (room) => {
            if (!room.name) {
              throw new AppException('Room name is missing.', 400);
            }
            await prisma.room.create({
              data: {
                eventEditionId: createdEventEdition.id,
                name: room.name,
                description: room.description || '',
              },
            });
          }),
        );
      }

      if (createEventEditionDto.coordinatorId) {
        const coordinator = await prisma.userAccount.findUnique({
          where: {
            id: createEventEditionDto.coordinatorId,
          },
        });
        if (coordinator !== null) {
          await prisma.committeeMember.create({
            data: {
              eventEditionId: createdEventEdition.id,
              userId: createEventEditionDto.coordinatorId,
              level: CommitteeLevel.Coordinator,
              role: CommitteeRole.OrganizingCommittee,
            },
          });
        }
      }

      const dtoData = {
        ...createdEventEdition,
        roomName: rooms.map((room) => room.name),
      };
      const eventResponseDto = new EventEditionResponseDto(dtoData);

      await this.scoringService.scheduleEventFinalScoresRecalculation(
        createdEventEdition,
      );
      return eventResponseDto;
    });
  }

  async createFromEventEditionForm(
    createFromEventEditionFormDto: CreateFromEventEditionFormDto,
  ): Promise<EventEditionResponseDto> {
    await this.committeeService.validateUniqueCommitteeMembers(
      createFromEventEditionFormDto,
    );

    const eventEdition = await this.create(createFromEventEditionFormDto);

    const { id: eventEditionId } = eventEdition;
    const {
      organizingCommitteeIds,
      itSupportIds,
      administrativeSupportIds,
      communicationIds,
    } = createFromEventEditionFormDto;

    await this.committeeService.createCommitteeMembersFromArray(
      eventEditionId,
      organizingCommitteeIds,
      CommitteeRole.OrganizingCommittee,
    );

    await this.committeeService.createCommitteeMembersFromArray(
      eventEditionId,
      itSupportIds,
      CommitteeRole.ITSupport,
    );

    await this.committeeService.createCommitteeMembersFromArray(
      eventEditionId,
      administrativeSupportIds,
      CommitteeRole.AdministativeSupport,
    );

    await this.committeeService.createCommitteeMembersFromArray(
      eventEditionId,
      communicationIds,
      CommitteeRole.Communication,
    );

    return eventEdition;
  }

  async validateUniqueCommitteeMembers(
    createFromEventEditionFormDto: CreateFromEventEditionFormDto,
  ): Promise<void> {
    return this.committeeService.validateUniqueCommitteeMembers(
      createFromEventEditionFormDto,
    );
  }

  async createCommitteeMembersFromArray(
    eventEditionId: string,
    ids: Array<string>,
    role: CommitteeRole,
  ) {
    return this.committeeService.createCommitteeMembersFromArray(
      eventEditionId,
      ids,
      role,
    );
  }

  async updateCommitteeMembersFromArray(
    eventEditionId: string,
    ids: Array<string>,
    role: CommitteeRole,
  ) {
    return this.committeeService.updateCommitteeMembersFromArray(
      eventEditionId,
      ids,
      role,
    );
  }

  async removeAdminsFromEndedEvents(): Promise<void> {
    return this.committeeService.removeAdminsFromEndedEvents();
  }

  /**
   * Lista todas as edições de eventos com suporte a busca textual e paginação por envelope (P3.2).
   */
  async getAll(
    search?: string,
    page?: number,
    pageSize?: number,
    paginated?: boolean,
  ): Promise<
    EventEditionResponseDto[] | PaginatedResponseDto<EventEditionResponseDto>
  > {
    const searchTerm = typeof search === 'string' ? search.trim() : '';
    const where: Prisma.EventEditionWhereInput = searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
        }
      : {};

    const total =
      typeof this.prismaClient.eventEdition?.count === 'function'
        ? await this.prismaClient.eventEdition.count({ where })
        : 0;

    const isPaginatedRequested =
      paginated === true || (page !== undefined && pageSize !== undefined);
    const currentPage = page && page > 0 ? page : 1;
    const limit = pageSize && pageSize > 0 ? pageSize : 20;
    const skip = isPaginatedRequested ? (currentPage - 1) * limit : undefined;
    const take = isPaginatedRequested ? limit : undefined;

    const events = await this.prismaClient.eventEdition.findMany({
      where,
      skip,
      take,
      orderBy: {
        startDate: 'desc',
      },
      include: {
        rooms: {
          select: {
            name: true,
          },
        },
      },
    });

    const items = events.map((event) => {
      const dtoData = {
        ...event,
        roomName: event.rooms?.map((room) => room.name) ?? [],
      };

      return new EventEditionResponseDto(dtoData);
    });

    if (paginated) {
      return PaginatedResponseDto.create(items, total, currentPage, limit);
    }

    return items;
  }

  async getById(id: string) {
    const event = await this.prismaClient.eventEdition.findUnique({
      where: {
        id,
      },
      include: {
        rooms: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!event) {
      throw new BadRequestException(
        'Não existe nenhum evento com esse identificador',
      );
    }

    const dtoData = {
      ...event,
      roomName: event.rooms?.map((room) => room.name) ?? [],
    };
    return new EventEditionResponseDto(dtoData);
  }

  async getByYear(year: number) {
    const event = await this.prismaClient.eventEdition.findFirst({
      where: {
        startDate: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
      include: {
        rooms: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Não há eventos para o ano informado');
    }

    const dtoData = {
      ...event,
      roomName: event.rooms?.map((room) => room.name) ?? [],
    };
    return new EventEditionResponseDto(dtoData);
  }

  async findActive() {
    const event = await this.prismaClient.eventEdition.findFirst({
      where: {
        isActive: true,
      },
      include: {
        rooms: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!event) {
      throw new BadRequestException('Não existe nenhum evento ativo');
    }

    const dtoData = {
      ...event,
      roomName: event.rooms?.map((room) => room.name) ?? [],
    };
    return new EventEditionResponseDto(dtoData);
  }

  async updateFromEventEditionForm(
    id: string,
    updateFromEventEditionFormDto: UpdateFromEventEditionFormDto,
  ): Promise<EventEditionResponseDto> {
    await this.update(id, updateFromEventEditionFormDto);

    const {
      organizingCommitteeIds,
      itSupportIds,
      administrativeSupportIds,
      communicationIds,
      coordinatorId,
      roomName,
    } = updateFromEventEditionFormDto;

    this.validateSubmissionPeriod(updateFromEventEditionFormDto);

    if (roomName) {
      const currentRooms = await this.prismaClient.room.findMany({
        where: { eventEditionId: id },
      });

      const roomsToDelete = currentRooms.filter(
        (room) => !roomName.includes(room.name),
      );

      for (const room of roomsToDelete) {
        const hasSessions = await this.prismaClient.presentationBlock.findFirst(
          {
            where: { roomId: room.id },
          },
        );

        if (hasSessions) {
          throw new BadRequestException(
            `Não é possível remover a sala "${room.name}" pois ela possui sessões associadas.`,
          );
        }
      }
      if (roomsToDelete.length > 0) {
        const roomsToDeleteIds = roomsToDelete.map((r) => r.id);

        await this.prismaClient.presentationBlock.deleteMany({
          where: { roomId: { in: roomsToDeleteIds } },
        });

        await this.prismaClient.room.deleteMany({
          where: { id: { in: roomsToDeleteIds } },
        });
      }

      const currentRoomNames = currentRooms.map((r) => r.name);
      const newRoomNamesToCreate = roomName.filter(
        (name) => !currentRoomNames.includes(name),
      );

      await Promise.all(
        newRoomNamesToCreate.map(async (name) => {
          await this.prismaClient.room.create({
            data: {
              eventEditionId: id,
              name: name,
              description: '',
            },
          });
        }),
      );
    }

    if (coordinatorId) {
      const coordinator = await this.prismaClient.userAccount.findUnique({
        where: {
          id: coordinatorId,
        },
      });

      if (coordinator !== null) {
        await this.prismaClient.committeeMember.deleteMany({
          where: {
            eventEditionId: id,
            userId: coordinatorId,
          },
        });

        await this.prismaClient.committeeMember.deleteMany({
          where: {
            eventEditionId: id,
            level: CommitteeLevel.Coordinator,
            role: CommitteeRole.OrganizingCommittee,
          },
        });

        await this.prismaClient.committeeMember.create({
          data: {
            eventEditionId: id,
            userId: coordinatorId,
            level: CommitteeLevel.Coordinator,
            role: CommitteeRole.OrganizingCommittee,
          },
        });

        await this.committeeService.updateUserLevel(
          coordinatorId,
          CommitteeLevel.Coordinator,
        );
      }
    }

    await this.committeeService.updateCommitteeMembersFromArray(
      id,
      organizingCommitteeIds ?? [],
      CommitteeRole.OrganizingCommittee,
    );

    await this.committeeService.updateCommitteeMembersFromArray(
      id,
      itSupportIds ?? [],
      CommitteeRole.ITSupport,
    );

    await this.committeeService.updateCommitteeMembersFromArray(
      id,
      administrativeSupportIds ?? [],
      CommitteeRole.AdministativeSupport,
    );

    await this.committeeService.updateCommitteeMembersFromArray(
      id,
      communicationIds ?? [],
      CommitteeRole.Communication,
    );

    return await this.getById(id);
  }

  async update(id: string, updateEventEdition: UpdateEventEditionDto) {
    const event = await this.prismaClient.eventEdition.findUnique({
      where: {
        id,
      },
    });

    if (!event) {
      throw new BadRequestException(
        'Não existe nenhum evento com esse identificador',
      );
    }
    if (updateEventEdition.roomName) {
      const currentRooms = await this.prismaClient.room.findMany({
        where: { eventEditionId: id },
      });

      const newRoomNames = updateEventEdition.roomName;
      const roomsToDelete = currentRooms.filter(
        (room) => !newRoomNames.includes(room.name),
      );

      for (const room of roomsToDelete) {
        const hasSessions = await this.prismaClient.presentationBlock.findFirst(
          {
            where: { roomId: room.id },
          },
        );

        if (hasSessions) {
          throw new BadRequestException(
            `Não é possível remover a sala "${room.name}" pois ela possui sessões associadas.`,
          );
        }
      }
    }

    this.validateSubmissionPeriod(updateEventEdition);
    const fieldsToIgnore = [
      'organizingCommitteeIds',
      'itSupportIds',
      'administrativeSupportIds',
      'communicationIds',
      'coordinatorId',
      'roomName',
      'rooms',
    ];

    const filteredData = Object.fromEntries(
      Object.entries(updateEventEdition).filter(
        ([key, value]) => value !== undefined && !fieldsToIgnore.includes(key),
      ),
    );

    await this.prismaClient.eventEdition.update({
      where: {
        id,
      },
      data: filteredData,
    });

    const updatedEvent = await this.prismaClient.eventEdition.findUnique({
      where: { id },
      include: {
        rooms: {
          select: { name: true },
        },
      },
    });

    if (!updatedEvent) {
      throw new NotFoundException('Event edition not found after update');
    }

    const dtoData = {
      ...updatedEvent,
      roomName: updatedEvent.rooms?.map((room) => room.name) ?? [],
    };
    const eventResponseDto = new EventEditionResponseDto(dtoData);

    await this.scoringService.handleEventUpdate(updatedEvent.id);

    return eventResponseDto;
  }

  async setActive(id: string) {
    const event = await this.prismaClient.eventEdition.findUnique({
      where: {
        id,
      },
    });

    if (!event) {
      throw new BadRequestException(
        'Não existe nenhum evento com esse identificador',
      );
    }

    await this.prismaClient.$transaction(async (prisma) => {
      await prisma.eventEdition.updateMany({
        where: {
          isActive: true,
          id: { not: id },
        },
        data: { isActive: false },
      });

      await prisma.eventEdition.update({
        where: { id },
        data: { isActive: true },
      });
    });

    const updatedEvent = await this.prismaClient.eventEdition.findUnique({
      where: { id },
      include: {
        rooms: {
          select: { name: true },
        },
      },
    });

    if (!updatedEvent) {
      throw new NotFoundException('Event edition not found after update');
    }

    const dtoData = {
      ...updatedEvent,
      roomName: updatedEvent.rooms?.map((room) => room.name) ?? [],
    };
    return new EventEditionResponseDto(dtoData);
  }

  async delete(id: string) {
    return this.prismaClient.$transaction(async (prisma) => {
      const eventToDelete = await prisma.eventEdition.findUnique({
        where: { id },
        include: {
          rooms: {
            select: { name: true },
          },
        },
      });

      if (!eventToDelete) {
        throw new BadRequestException(
          'Não existe nenhum evento com esse identificador',
        );
      }

      await prisma.eventEdition.delete({
        where: { id },
      });

      if (eventToDelete.isActive) {
        const previousEvent = await prisma.eventEdition.findFirst({
          where: {
            startDate: { lt: eventToDelete.startDate },
          },
          orderBy: { startDate: 'desc' },
        });

        if (previousEvent) {
          await prisma.eventEdition.update({
            where: { id: previousEvent.id },
            data: { isActive: true },
          });
        }
      }

      const dtoData = {
        ...eventToDelete,
        roomName: eventToDelete.rooms?.map((room) => room.name) ?? [],
      };
      return new EventEditionResponseDto(dtoData);
    });
  }

  private async defineEvaluationCriteriaAndRooms(
    activeEvent: { id: string } | null,
    prisma: Prisma.TransactionClient,
    createEventEditionDto: CreateEventEditionDto,
  ) {
    const evaluationCriteria = activeEvent
      ? await prisma.evaluationCriteria.findMany({
          where: {
            eventEditionId: activeEvent.id,
          },
        })
      : [];

    const rooms = activeEvent
      ? createEventEditionDto.roomName &&
        createEventEditionDto.roomName.length > 0
        ? createEventEditionDto.roomName.map((name) => ({
            name,
            description: '',
          }))
        : await prisma.room.findMany({
            where: { eventEditionId: activeEvent.id },
            select: { name: true, description: true },
          })
      : createEventEditionDto.roomName &&
          createEventEditionDto.roomName.length > 0
        ? createEventEditionDto.roomName.map((name) => ({
            name,
            description: '',
          }))
        : [{ name: 'Auditório Principal', description: '' }];

    return { evaluationCriteria, rooms };
  }

  private validateSubmissionPeriod(
    createEventEditionDto: CreateEventEditionDto | UpdateEventEditionDto,
  ) {
    let submissionDeadline = createEventEditionDto.submissionDeadline;
    if (submissionDeadline) {
      submissionDeadline =
        submissionDeadline instanceof Date
          ? submissionDeadline
          : new Date(submissionDeadline);
    } else if (createEventEditionDto.startDate) {
      submissionDeadline = createEventEditionDto.startDate;
    }

    if (submissionDeadline && submissionDeadline <= new Date()) {
      throw new BadRequestException(
        'O fim do período de submissão deve ser no futuro.',
      );
    } else if (
      submissionDeadline &&
      createEventEditionDto.startDate &&
      submissionDeadline > createEventEditionDto.startDate
    ) {
      throw new BadRequestException(
        'O fim do período de submissão deve ser anterior ao início do evento.',
      );
    }

    if (createEventEditionDto.submissionStartDate) {
      const submissionStartDate =
        createEventEditionDto.submissionStartDate instanceof Date
          ? createEventEditionDto.submissionStartDate
          : new Date(createEventEditionDto.submissionStartDate);

      if (submissionDeadline && submissionStartDate >= submissionDeadline) {
        throw new BadRequestException(
          'A data de início do período de submissão deve ser anterior ao fim do período de submissão.',
        );
      }
    }
  }
}
