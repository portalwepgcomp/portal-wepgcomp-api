import { Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePresentationBlockDto } from './dto/create-presentation-block.dto';

@Injectable()
export class PresentationBlockTimeService {
  constructor(private readonly prismaClient: PrismaService) {}

  async validateAndProcessTime(
    eventEdition: {
      startDate: Date;
      endDate: Date;
    },
    createPresentationBlockDto: CreatePresentationBlockDto,
  ): Promise<void> {
    if (eventEdition.startDate > createPresentationBlockDto.startTime) {
      throw new AppException(
        'O início da sessão foi marcado para antes do início da edição do evento',
        400,
      );
    }

    if (eventEdition.endDate < createPresentationBlockDto.startTime) {
      throw new AppException(
        'O início da sessão foi marcado para depois do fim da edição do evento',
        400,
      );
    }

    const endTime =
      createPresentationBlockDto.startTime.getTime() +
      (createPresentationBlockDto.duration ?? 0) * 1000 * 60;
    const endTimeDate = new Date(endTime);
    if (eventEdition.endDate < endTimeDate) {
      throw new AppException(
        'O fim da sessão foi marcado para depois do fim da edição do evento',
        400,
      );
    }

    // For all presentationBlocks of the same event, none can overlap with the new one
    const presentationBlocks =
      await this.prismaClient.presentationBlock.findMany({
        where: {
          eventEditionId: createPresentationBlockDto.eventEditionId,
        },
      });

    if (presentationBlocks != null) {
      for (const block of presentationBlocks) {
        const blockEndTime =
          block.startTime.getTime() + block.duration * 1000 * 60;
        const blockEndTimeDate = new Date(blockEndTime);

        if (
          (createPresentationBlockDto.startTime >= block.startTime &&
            createPresentationBlockDto.startTime < blockEndTimeDate) ||
          (endTimeDate > block.startTime && endTimeDate <= blockEndTimeDate)
        ) {
          throw new AppException(
            'A sessão informada se sobrepõe a outra sessão já existente',
            400,
          );
        }
      }
    }
  }

  calculatePresentationStartTime(
    blockStartTime: Date,
    positionWithinBlock: number,
    presentationDuration: number,
  ): Date {
    const presentationTime = new Date(blockStartTime);
    presentationTime.setMinutes(
      presentationTime.getMinutes() +
        positionWithinBlock * presentationDuration,
    );

    return presentationTime;
  }

  async processPresentationBlock(presentationBlock: any): Promise<any> {
    // Fetch the associated event edition to get presentation duration
    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: presentationBlock.eventEditionId,
      },
    });

    if (!eventEdition) {
      throw new AppException('Edição do evento não encontrada', 404);
    }

    const presentationDuration = eventEdition.presentationDuration;

    // For 'General' type blocks, return without calculations
    if (presentationBlock.type !== 'Presentation') {
      return {
        ...presentationBlock,
        presentations: [],
        availablePositionsWithinBlock: [],
      };
    }

    // Calculate total and available positions
    const totalPositions = Math.floor(
      presentationBlock.duration / presentationDuration,
    );

    const occupiedPositions = presentationBlock.presentations.map(
      (p: any) => p.positionWithinBlock,
    );

    const availablePositionsWithinBlock: {
      positionWithinBlock: number;
      startTime: Date;
    }[] = [];

    for (let i = 0; i < totalPositions; i++) {
      if (!occupiedPositions.includes(i)) {
        const positionStartTime = new Date(presentationBlock.startTime);
        positionStartTime.setMinutes(
          positionStartTime.getMinutes() + i * presentationDuration,
        );

        availablePositionsWithinBlock.push({
          positionWithinBlock: i,
          startTime: positionStartTime,
        });
      }
    }

    // Calculate start times for existing presentations
    const presentationsWithStartTime = presentationBlock.presentations.map(
      (presentation: any) => {
        const startTime = this.calculatePresentationStartTime(
          presentationBlock.startTime,
          presentation.positionWithinBlock,
          presentationDuration,
        );

        return {
          ...presentation,
          startTime,
        };
      },
    );

    return {
      ...presentationBlock,
      presentations: presentationsWithStartTime,
      availablePositionsWithinBlock,
    };
  }
}
