import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventEdition, PresentationBlockType } from '@prisma/client';
import { ScoringCalculatorService } from './scoring-calculator.service';

@Injectable()
export class ScoringService {
  private readonly MAX_TIMEOUT = 2147483647; // ~24.85 days in milliseconds
  // DB is stored in UTC, but when we get it from the DB, it's already in UTC-3
  private readonly TIMEZONE_OFFSET = -3 * 60 * 60 * 1000; // UTC-3 in milliseconds

  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly calculatorService: ScoringCalculatorService,
  ) {
    this.initializeEventFinalScoresSchedulers();
  }

  async recalculateAllScores(eventEditionId: string): Promise<void> {
    const eventStats =
      await this.calculatorService.calculateEventStats(eventEditionId);

    const presentations = await this.prismaClient.presentation.findMany({
      where: {
        submission: {
          eventEditionId,
        },
      },
      include: {
        submission: {
          include: {
            Evaluation: {
              include: {
                evaluationCriteria: true,
                user: true,
              },
            },
          },
        },
        presentationBlock: {
          include: {
            panelists: true,
          },
        },
      },
    });

    for (const presentation of presentations) {
      const panelistIds = presentation.presentationBlock.panelists.map(
        (p) => p.userId,
      );

      const publicEvaluations: { score: number; weightRadio: number }[] = [];
      const panelistEvaluations: { score: number; weightRadio: number }[] = [];

      for (const evaluation of presentation.submission.Evaluation) {
        const evaluationData = {
          score: evaluation.score,
          weightRadio:
            evaluation.evaluationCriteria.weightRadio ||
            this.calculatorService.config.defaultWeight,
        };

        if (evaluation.userId && panelistIds.includes(evaluation.userId)) {
          panelistEvaluations.push(evaluationData);
        } else {
          publicEvaluations.push(evaluationData);
        }
      }

      const publicScore = this.calculatorService.calculateBayesianMean(
        publicEvaluations,
        eventStats,
        false,
      );
      const evaluatorsScore = this.calculatorService.calculateBayesianMean(
        panelistEvaluations,
        eventStats,
        true,
      );

      await this.prismaClient.presentation.update({
        where: { id: presentation.id },
        data: {
          publicAverageScore: publicScore,
          evaluatorsAverageScore: evaluatorsScore,
        },
      });
    }
  }

  /**
   * Adjusts a date to Brazilian timezone (UTC-3).
   */
  private adjustToBrazilianTimezone(date: Date): Date {
    const localDate = new Date(date);
    return new Date(localDate.getTime() + this.TIMEZONE_OFFSET);
  }

  private async initializeEventFinalScoresSchedulers() {
    try {
      const events = await this.prismaClient.eventEdition.findMany({
        where: {
          endDate: {
            gt: this.adjustToBrazilianTimezone(new Date()),
          },
        },
      });

      events.forEach((event) => {
        this.scheduleEventFinalScoresRecalculation(event);
      });

      this.logger.log(
        `Initialized schedulers for ${events.length} upcoming events`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize event schedulers:', error);
    }
  }

  async scheduleEventFinalScoresRecalculation(event: EventEdition) {
    const jobName = `recalculate-scores-${event.id}`;
    try {
      this.schedulerRegistry.deleteTimeout(jobName);
    } catch {
      this.logger.log(`No existing timeout found for event ${event.id}`);
    }

    const now = new Date();
    const endDate = event.endDate;

    // Find the last presentation block
    const lastBlock = await this.prismaClient.presentationBlock.findFirst({
      where: {
        eventEditionId: event.id,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    let scheduleTime: Date;
    let decision: string;
    // If the last block is General type, use its start time
    if (
      lastBlock &&
      lastBlock.type === PresentationBlockType.General &&
      lastBlock.startTime > now
    ) {
      scheduleTime = lastBlock.startTime;
      decision = 'Last block start time';
    } else {
      // Otherwise, use the original event end date
      scheduleTime = endDate;
      decision = 'Event end date';
    }

    const delay = scheduleTime.getTime() - now.getTime();

    // Only schedule if the calculated time hasn't passed yet
    if (delay > 0) {
      if (delay > this.MAX_TIMEOUT) {
        const timeout = setTimeout(() => {
          this.logger.log(
            `Intermediate timeout reached for event ${event.id}, rescheduling...`,
          );
          this.scheduleEventFinalScoresRecalculation(event);
        }, this.MAX_TIMEOUT);

        this.schedulerRegistry.addTimeout(jobName, timeout);
        this.logger.log(
          `Scheduled intermediate timeout for event ${event.id} (${decision}) in ${Math.floor(
            this.MAX_TIMEOUT / (1000 * 60 * 60 * 24),
          )} days`,
        );
      } else {
        const timeout = setTimeout(async () => {
          try {
            this.logger.log(
              `Recalculating scores for event ${event.id} (${event.name})`,
            );
            await this.recalculateAllScores(event.id);
            this.logger.log(
              `Successfully recalculated scores for event ${event.id}`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to recalculate scores for event ${event.id}:`,
              error,
            );
          }
        }, delay);

        this.schedulerRegistry.addTimeout(jobName, timeout);
        this.logger.log(
          `Scheduled final score recalculation for event ${event.id} at ${scheduleTime} (${decision})`,
        );
      }
    }
  }

  async handleEventUpdate(eventEditionId: string): Promise<void> {
    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: {
        id: eventEditionId,
      },
    });

    if (!eventEdition) {
      this.logger.log(
        `Event ${eventEditionId} not found for the handleEventUpdate`,
        400,
      );
      return;
    }

    if (eventEdition.endDate < new Date()) {
      this.logger.log(
        `Event ${eventEditionId} has already ended, not scheduling recalculation`,
      );
      return;
    }

    this.scheduleEventFinalScoresRecalculation(eventEdition);
  }
}
