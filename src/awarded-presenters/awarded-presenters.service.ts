import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RankingResponseDtoDto } from './dto/response-awarded-presenters.dto';

@Injectable()
export class AwardedPresentersService {
  constructor(private prismaClient: PrismaService) {}

  async findTopEvaluatorsRanking(
    eventEditionId: string,
    limit?: number,
  ): Promise<RankingResponseDtoDto[]> {
    const presentations = await this.prismaClient.presentation.findMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
        evaluatorsAverageScore: {
          not: null,
        },
      },
      orderBy: {
        evaluatorsAverageScore: 'desc',
      },
      ...(limit && { take: limit }),
      include: {
        submission: {
          include: {
            mainAuthor: true,
          },
        },
      },
    });

    return presentations.map(
      (presentation) => new RankingResponseDtoDto(presentation),
    );
  }

  async findTopPublicRanking(
    eventEditionId: string,
    limit?: number,
  ): Promise<RankingResponseDtoDto[]> {
    const presentations = await this.prismaClient.presentation.findMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
        publicAverageScore: {
          not: null,
        },
      },
      orderBy: {
        publicAverageScore: 'desc',
      },
      ...(limit && { take: limit }),
      include: {
        submission: {
          include: {
            mainAuthor: true,
          },
        },
      },
    });

    return presentations.map(
      (presentation) => new RankingResponseDtoDto(presentation),
    );
  }
}
