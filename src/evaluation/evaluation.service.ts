import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(evaluations: CreateEvaluationDto[]) {
    const results: any[] = [];

    for (const evaluation of evaluations) {
      const presentation = await this.prisma.submission.findUnique({
        where: { id: evaluation.submissionId },
      });
      if (!presentation) {
        throw new AppException('Apresentação não encontrada.', 404);
      }

      const user = await this.prisma.userAccount.findUnique({
        where: { id: evaluation.userId },
      });
      if (!user) {
        throw new AppException('Usuário não encontrado.', 404);
      }

      const existingEvaluation = await this.prisma.evaluation.findFirst({
        where: {
          userId: evaluation.userId,
          submissionId: evaluation.submissionId,
          evaluationCriteriaId: evaluation.evaluationCriteriaId,
        },
      });

      if (existingEvaluation) {
        const updatedEvaluation = await this.prisma.evaluation.update({
          where: { id: existingEvaluation.id },
          data: { score: evaluation.score, comments: evaluation.comments },
        });
        results.push(updatedEvaluation);
      }
    }

    const newEvaluations = evaluations.filter(
      (evaluation) =>
        !results.some(
          (res) =>
            res.userId === evaluation.userId &&
            res.submissionId === evaluation.submissionId &&
            res.evaluationCriteriaId === evaluation.evaluationCriteriaId,
        ),
    );

    if (newEvaluations.length > 0) {
      await this.prisma.evaluation.createMany({
        data: newEvaluations,
      });
      results.push(...newEvaluations);
    }

    return results;
  }

  async findAll() {
    return this.prisma.evaluation.findMany({
      include: {
        user: true,
        evaluationCriteria: true,
        submission: true,
      },
    });
  }

  async findOne(userId: string) {
    const evaluations = await this.prisma.evaluation.findMany({
      where: { userId },
      include: {
        evaluationCriteria: true,
        submission: true,
      },
    });
    if (!evaluations) {
      throw new AppException(
        `Nenhuma avaliação encontrada para o usuário ${userId}`,
        404,
      );
    }
    return evaluations;
  }

  /** Média simples das notas de uma submissão (critérios × avaliadores). */
  async calculateFinalGrade(submissionId: string) {
    const evaluations = await this.prisma.evaluation.findMany({
      where: { submissionId },
      select: { score: true },
    });

    if (evaluations.length === 0) {
      throw new AppException(
        `Nenhuma avaliação encontrada para o usuário ${submissionId}`,
        404,
      );
    }

    const totalScore = evaluations.reduce(
      (sum, evaluation) => sum + evaluation.score,
      0,
    );
    const finalGrade = totalScore / evaluations.length;

    return finalGrade;
  }
}
