import { Injectable } from '@nestjs/common';
import { PresentationBlockType } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreatePresentationBlockDto } from './dto/create-presentation-block.dto';
import { SwapMultiplePresentationsDto } from './dto/swap-presentations.dto';
import { UpdatePresentationBlockDto } from './dto/update-presentation-block.dto';
import { PresentationBlockAllocationService } from './presentation-block-allocation.service';
import { PresentationBlockTimeService } from './presentation-block-time.service';

@Injectable()
export class PresentationBlockService {
  constructor(
    private readonly prismaClient: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly timeService: PresentationBlockTimeService,
    private readonly allocationService: PresentationBlockAllocationService,
  ) {}

  async create(createPresentationBlockDto: CreatePresentationBlockDto) {
    const eventEdition = await this.validateTypeAndEventEdition(
      createPresentationBlockDto,
    );

    await this.validateRoom(createPresentationBlockDto);

    await this.timeService.validateAndProcessTime(
      eventEdition,
      createPresentationBlockDto,
    );

    const {
      submissions,
      panelists,
      numPresentations,
      ...presentationBlockData
    } = createPresentationBlockDto;

    const createdPresentationBlock = await this.prismaClient.$transaction(
      async (tx) => {
        const block = await tx.presentationBlock.create({
          data: {
            ...presentationBlockData,
            duration: createPresentationBlockDto.duration ?? 0,
          },
        });

        if (
          createPresentationBlockDto.type === PresentationBlockType.Presentation
        ) {
          await this.allocationService.allocateSubmissionsAndPanelistsOnCreate(
            tx,
            block.id,
            submissions,
            panelists,
            numPresentations,
          );
        } else if (panelists && panelists.length > 0) {
          await this.allocationService.allocateSubmissionsAndPanelistsOnCreate(
            tx,
            block.id,
            undefined,
            panelists,
            numPresentations,
          );
        }

        return block;
      },
    );

    if (createPresentationBlockDto.type === PresentationBlockType.General) {
      await this.scoringService.handleEventUpdate(eventEdition.id);
    }

    return createdPresentationBlock;
  }

  async findAll(
    requestingUserId: string,
    eventEditionId?: string,
    panelistId?: string,
  ) {
    if (requestingUserId && panelistId && panelistId !== requestingUserId) {
      throw new AppException('Acesso negado', 403);
    }
    const preFiltering: Record<string, any> = {};
    if (eventEditionId) {
      preFiltering['eventEditionId'] = eventEditionId;
      const eventEdition = await this.prismaClient.eventEdition.findUnique({
        where: { id: eventEditionId },
      });

      if (!eventEdition) {
        throw new AppException('Edição do evento não encontrada', 404);
      }
    }
    let presentationBlocks = await this.prismaClient.presentationBlock.findMany(
      {
        where: preFiltering,
        include: {
          presentations: {
            include: {
              submission: true,
            },
          },
          panelists: {
            include: {
              user: true,
            },
          },
        },
      },
    );
    presentationBlocks = panelistId
      ? presentationBlocks.filter((block) =>
          block.panelists.some((panelist) => panelist.userId === panelistId),
        )
      : presentationBlocks;
    return Promise.all(
      presentationBlocks.map((block) =>
        this.timeService.processPresentationBlock(block),
      ),
    );
  }

  async findOne(id: string) {
    const presentationBlock =
      await this.prismaClient.presentationBlock.findUnique({
        where: { id },
        include: {
          presentations: {
            include: {
              submission: true,
            },
          },
          panelists: {
            include: {
              user: true,
            },
          },
        },
      });

    if (!presentationBlock) {
      throw new AppException('Sessão não encontrada', 404);
    }

    return this.timeService.processPresentationBlock(presentationBlock);
  }

  async update(
    id: string,
    updatePresentationBlockDto: UpdatePresentationBlockDto,
  ) {
    this.validateTypeUpdate(updatePresentationBlockDto);
    const presentationBlock =
      await this.prismaClient.presentationBlock.findUnique({
        where: {
          id,
        },
      });
    if (presentationBlock == null) {
      throw new AppException('Sessão não encontrada', 404);
    }
    if (updatePresentationBlockDto.duration == null) {
      const eventEdition = await this.prismaClient.eventEdition.findUnique({
        where: {
          id: presentationBlock.eventEditionId,
        },
      });
      if (!eventEdition) {
        throw new AppException('Event edition not found', 404);
      }
      updatePresentationBlockDto.duration =
        eventEdition.presentationDuration *
        (updatePresentationBlockDto.numPresentations ?? 0);
    }

    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      numPresentations,
      submissions,
      panelists,
      ...without_num_presentations
    } = updatePresentationBlockDto;

    const result = await this.prismaClient.$transaction(async (tx) => {
      await this.allocationService.allocateSubmissionsAndPanelistsOnUpdate(
        tx,
        id,
        submissions,
        panelists,
      );

      return await tx.presentationBlock.update({
        where: {
          id,
        },
        data: without_num_presentations,
      });
    });

    if (updatePresentationBlockDto.type === PresentationBlockType.General) {
      await this.scoringService.handleEventUpdate(result.eventEditionId);
    }
    return result;
  }

  async remove(id: string) {
    const result = await this.prismaClient.presentationBlock.delete({
      where: {
        id,
      },
    });

    await this.scoringService.handleEventUpdate(result.eventEditionId);
    return result;
  }

  async swapPresentations(
    id: string,
    swapMultiplePresentationsDto: SwapMultiplePresentationsDto,
  ) {
    return this.allocationService.swapPresentations(
      id,
      swapMultiplePresentationsDto,
    );
  }

  async findUserById(userId: string) {
    return await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
    });
  }

  private async validateRoom(
    createPresentationBlockDto: CreatePresentationBlockDto,
  ) {
    if (createPresentationBlockDto.roomId) {
      const roomExists = await this.prismaClient.room.findUnique({
        where: {
          id: createPresentationBlockDto.roomId,
        },
      });

      if (roomExists == null) {
        throw new AppException('Sala não encontrada', 404);
      }
    }
  }

  private async validateTypeAndEventEdition(
    createPresentationBlockDto: CreatePresentationBlockDto,
  ) {
    if (
      createPresentationBlockDto.type === PresentationBlockType.General &&
      createPresentationBlockDto.duration == null
    ) {
      throw new AppException(
        'A duração da sessão geral deve ser informada',
        400,
      );
    } else if (
      createPresentationBlockDto.type === PresentationBlockType.Presentation &&
      createPresentationBlockDto.numPresentations == null
    ) {
      throw new AppException(
        'O número de apresentações deve ser informado para sessões de apresentação',
        400,
      );
    }
    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: createPresentationBlockDto.eventEditionId,
      },
    });
    if (eventEdition == null) {
      throw new AppException('Edição do evento não encontrada', 404);
    }
    if (typeof createPresentationBlockDto.duration !== 'number') {
      createPresentationBlockDto.duration =
        (createPresentationBlockDto.numPresentations ?? 0) *
        eventEdition.presentationDuration;
    } else {
      createPresentationBlockDto.numPresentations = 0;
    }
    return eventEdition;
  }

  private validateTypeUpdate(
    updatePresentationBlockDto: UpdatePresentationBlockDto,
  ) {
    if (
      updatePresentationBlockDto.duration == null &&
      updatePresentationBlockDto.numPresentations == null
    ) {
      throw new AppException(
        'É necessário informar a duração da sessão ou o número de apresentações',
        400,
      );
    } else if (
      updatePresentationBlockDto.duration != null &&
      updatePresentationBlockDto.numPresentations != null
    ) {
      throw new AppException(
        'Informe ou duração ou número de apresentações, não ambos',
        400,
      );
    } else if (
      updatePresentationBlockDto.duration != null &&
      updatePresentationBlockDto.type === PresentationBlockType.Presentation
    ) {
      throw new AppException(
        'A duração não pode ser especificada para sessões de apresentação, apenas número de apresentações',
        400,
      );
    } else if (
      updatePresentationBlockDto.numPresentations != null &&
      updatePresentationBlockDto.type === PresentationBlockType.General
    ) {
      throw new AppException(
        'O número de apresentações não pode ser especificado para sessões gerais, apenas a duração',
        400,
      );
    }
  }
}
