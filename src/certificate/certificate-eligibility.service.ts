import { Injectable } from '@nestjs/common';
import { Profile } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificateEligibilityService {
  constructor(private readonly prismaClient: PrismaService) {}

  /**
   * Validates if a user is eligible to receive a certificate based on their profile and participation.
   */
  async validateUserEligibility(user: any, eventEdition: any): Promise<void> {
    if (!user) {
      throw new AppException('Usuário não encontrado', 404);
    } else if (!eventEdition) {
      throw new AppException('Edição do evento não encontrada', 404);
    }

    if (user.profile === Profile.Listener) {
      const evaluationCount = await this.prismaClient.evaluation.count({
        where: {
          userId: user.id,
          submission: {
            eventEditionId: eventEdition.id,
          },
        },
      });
      if (evaluationCount < 10) {
        throw new AppException(
          'Usuário ouvinte deve avaliar ao menos 10 apresentações pare receber o certificado',
          404,
        );
      }
    } else if (
      user.profile === Profile.Presenter &&
      !user.mainAuthored?.length
    ) {
      throw new AppException(
        'Apresentador não tem submissões, portanto não pode receber certificado',
        404,
      );
    } else if (
      user.profile === Profile.Professor &&
      !user.panelistParticipations?.length
    ) {
      throw new AppException(
        'Professor não participou de mesas avaliadoras, portanto não pode receber certificado',
        404,
      );
    }

    if (eventEdition.endDate > new Date()) {
      throw new AppException(
        'Evento ainda não terminou, portanto certificados não estão disponíveis',
        404,
      );
    }
  }

  /**
   * Calculates the award results for a user's presentation based on public and evaluator scores.
   */
  calculateAwardStandings(
    presentations: any[],
    userSubmission: any,
  ): {
    userPublicAwardStandings: number;
    userEvaluatorsAwardStandings: number;
  } {
    presentations.sort((a: any, b: any) => {
      const scoreA = a.publicAverageScore ?? 0;
      const scoreB = b.publicAverageScore ?? 0;
      return scoreB - scoreA;
    });

    let currentRank = 1;
    let currentScore = presentations[0]?.publicAverageScore ?? 0;
    const publicRanks = new Map();

    presentations.forEach((presentation: any, index: number) => {
      if (presentation.publicAverageScore !== currentScore) {
        currentRank = index + 1;
        currentScore = presentation.publicAverageScore ?? 0;
      }
      publicRanks.set(presentation.submissionId, currentRank);
    });

    presentations.sort((a: any, b: any) => {
      const scoreA = a.evaluatorsAverageScore ?? 0;
      const scoreB = b.evaluatorsAverageScore ?? 0;
      return scoreB - scoreA;
    });

    currentRank = 1;
    currentScore = presentations[0]?.evaluatorsAverageScore ?? 0;
    const evaluatorRanks = new Map();

    presentations.forEach((presentation: any, index: number) => {
      if (presentation.evaluatorsAverageScore !== currentScore) {
        currentRank = index + 1;
        currentScore = presentation.evaluatorsAverageScore ?? 0;
      }
      evaluatorRanks.set(presentation.submissionId, currentRank);
    });

    const INT_MAX = 2 ** 31 - 1;
    return {
      userPublicAwardStandings: userSubmission
        ? publicRanks.get(userSubmission.id) || INT_MAX
        : INT_MAX,
      userEvaluatorsAwardStandings: userSubmission
        ? evaluatorRanks.get(userSubmission.id) || INT_MAX
        : INT_MAX,
    };
  }
}
