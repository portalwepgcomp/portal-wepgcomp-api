import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

@Injectable()
export class PresentationScoringService {
  private readonly logger = new Logger(PresentationScoringService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  async recalculateAllScores(eventEditionId: string): Promise<void> {
    const eventEditionExists = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: eventEditionId,
      },
    });

    if (!eventEditionExists) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    await this.scoringService.recalculateAllScores(eventEditionId);
  }

  async resetEvaluatorsScores(eventEditionId: string): Promise<void> {
    const eventEditionExists = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: eventEditionId,
      },
    });

    if (!eventEditionExists) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    // Buscar todos os panelists do evento
    const panelists = await this.prismaClient.panelist.findMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
      },
      select: {
        userId: true,
      },
    });

    const panelistUserIds = panelists.map((p) => p.userId);

    // Buscar todas as submissions do evento
    const submissions = await this.prismaClient.submission.findMany({
      where: {
        Presentation: {
          some: {
            presentationBlock: {
              eventEditionId: eventEditionId,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    const submissionIds = submissions.map((s) => s.id);

    // Deletar avaliações de panelists
    await this.prismaClient.evaluation.deleteMany({
      where: {
        submissionId: {
          in: submissionIds,
        },
        userId: {
          in: panelistUserIds,
        },
      },
    });

    // Resetar scores dos avaliadores
    await this.prismaClient.presentation.updateMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
      },
      data: {
        evaluatorsAverageScore: null,
      },
    });
  }

  async resetPublicScores(eventEditionId: string): Promise<void> {
    const eventEditionExists = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: eventEditionId,
      },
    });

    if (!eventEditionExists) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    // Buscar todos os panelists do evento
    const panelists = await this.prismaClient.panelist.findMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
      },
      select: {
        userId: true,
      },
    });

    const panelistUserIds = panelists.map((p) => p.userId);

    // Buscar todas as submissions do evento
    const submissions = await this.prismaClient.submission.findMany({
      where: {
        Presentation: {
          some: {
            presentationBlock: {
              eventEditionId: eventEditionId,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    const submissionIds = submissions.map((s) => s.id);

    // Deletar avaliações do público (quem NÃO é panelist)
    await this.prismaClient.evaluation.deleteMany({
      where: {
        submissionId: {
          in: submissionIds,
        },
        OR: [
          {
            userId: {
              notIn: panelistUserIds,
            },
          },
          {
            userId: null, // Avaliações sem userId (público anônimo)
          },
        ],
      },
    });

    // Resetar scores do público
    await this.prismaClient.presentation.updateMany({
      where: {
        presentationBlock: {
          eventEditionId: eventEditionId,
        },
      },
      data: {
        publicAverageScore: null,
      },
    });
  }

  async resetCommitteeScores(eventEditionId: string): Promise<void> {
    this.logger.log(
      `Resetting committee scores for event edition: ${eventEditionId}`,
    );

    const eventEditionExists = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: eventEditionId,
      },
    });

    if (!eventEditionExists) {
      this.logger.error(`Event edition not found: ${eventEditionId}`);
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    // Deletar todos os registros de avaliadores premiados (AwardedPanelist) do evento
    // Isso remove todos os votos dos avaliadores
    const deletedCount = await this.prismaClient.awardedPanelist.deleteMany({
      where: {
        eventEditionId: eventEditionId,
      },
    });

    this.logger.log(
      `Deleted ${deletedCount.count} awarded panelist records for event edition: ${eventEditionId}`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async calculateScoresForActiveEvent() {
    try {
      this.logger.log('Starting daily score calculation for active event');

      // Find the active event edition
      const activeEventEdition = await this.prismaClient.eventEdition.findFirst(
        {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            endDate: true,
          },
        },
      );

      if (!activeEventEdition) {
        this.logger.warn('No active event edition found');
        return;
      }

      const now = new Date();
      if (activeEventEdition.endDate < now) {
        this.logger.warn(
          `Event ${activeEventEdition.name} has already ended on ${activeEventEdition.endDate.toISOString()}`,
        );
        return;
      }

      // Calculate scores for all presentations in the active event
      await this.recalculateAllScores(activeEventEdition.id);

      this.logger.log(
        `Successfully calculated scores for event: ${activeEventEdition.id}`,
      );
    } catch (error) {
      this.logger.error('Error calculating scores:', error);
    }
  }
}
