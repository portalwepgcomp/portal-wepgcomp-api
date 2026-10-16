import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { AppException } from '../exceptions/app.exception';
import { AnonymousEvaluationDto } from './dto/anonymous-evaluation.dto';

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(presentationId: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      select: {
        id: true,
        submission: {
          select: {
            id: true,
            title: true,
            mainAuthor: { select: { name: true } },
            eventEdition: {
              select: {
                id: true,
                name: true,
                isActive: true,
                isEvaluationRestrictToLoggedUsers: true,
              },
            },
          },
        },
      },
    });
    if (!presentation)
      throw new AppException('Apresentação não encontrada.', 404);

    const { submission } = presentation;
    const criteria = submission.eventEdition.isEvaluationRestrictToLoggedUsers
      ? []
      : await this.prisma.evaluationCriteria.findMany({
          where: { eventEditionId: submission.eventEdition.id },
          select: { id: true, title: true, description: true },
          orderBy: { createdAt: 'asc' },
        });

    return {
      presentationId: presentation.id,
      submissionId: submission.id,
      title: submission.title,
      authorName: submission.mainAuthor.name,
      eventEdition: submission.eventEdition,
      criteria,
    };
  }

  async createAnonymous(body: AnonymousEvaluationDto) {
    const submissionId = body.evaluations[0]?.submissionId;
    if (
      !submissionId ||
      body.evaluations.some((e) => e.submissionId !== submissionId)
    ) {
      throw new AppException('Avalie uma única apresentação por envio.', 400);
    }

    await this.prisma.$transaction(async (tx) => {
      // Serializa reenvios do mesmo trabalho para não duplicar votos por e-mail.
      await tx.$queryRaw`SELECT id FROM submission WHERE id = ${submissionId} FOR UPDATE`;
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { eventEdition: true, Presentation: { select: { id: true } } },
      });
      if (!submission || submission.Presentation.length === 0) {
        throw new AppException('Apresentação não encontrada.', 404);
      }
      if (submission.eventEdition.isEvaluationRestrictToLoggedUsers) {
        throw new AppException('Esta edição exige login para avaliar.', 403);
      }
      if (!submission.eventEdition.isActive) {
        throw new AppException(
          'Esta edição não está aberta para avaliações.',
          403,
        );
      }

      const criteria = await tx.evaluationCriteria.findMany({
        where: { eventEditionId: submission.eventEditionId },
        select: { id: true },
      });
      const suppliedIds = new Set(
        body.evaluations.map((e) => e.evaluationCriteriaId),
      );
      if (
        criteria.length === 0 ||
        suppliedIds.size !== body.evaluations.length ||
        criteria.length !== suppliedIds.size ||
        criteria.some((c) => !suppliedIds.has(c.id))
      ) {
        throw new AppException(
          'Preencha todos os critérios desta edição uma única vez.',
          400,
        );
      }

      const email = body.email.trim().toLowerCase();
      for (const evaluation of body.evaluations) {
        const existing = await tx.evaluation.findFirst({
          where: {
            submissionId,
            evaluationCriteriaId: evaluation.evaluationCriteriaId,
            userId: null,
            email,
          },
          select: { id: true },
        });
        const data = {
          score: evaluation.score,
          comments: evaluation.comments,
          name: body.name.trim(),
          email,
        };
        if (existing) {
          await tx.evaluation.update({ where: { id: existing.id }, data });
        } else {
          await tx.evaluation.create({
            data: {
              ...data,
              userId: null,
              submissionId,
              evaluationCriteriaId: evaluation.evaluationCriteriaId,
            },
          });
        }
      }
    });

    return { message: 'Avaliação realizada com sucesso.' };
  }

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
