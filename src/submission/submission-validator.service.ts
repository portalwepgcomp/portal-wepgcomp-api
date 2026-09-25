import { Injectable } from '@nestjs/common';
import {
  PresentationBlockType,
  Prisma,
  Profile,
  Submission,
  SubmissionStatus,
} from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { availableSubmissionSlots } from '../presentation-block/presentation-block-availability';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

@Injectable()
export class SubmissionValidatorService {
  constructor(private readonly prismaClient: PrismaService) {}

  async validateCreate(
    dto: CreateSubmissionDto,
    db: Prisma.TransactionClient = this.prismaClient,
  ): Promise<void> {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      proposedPresentationBlockId,
      proposedPositionWithinBlock,
    } = dto;

    const users = await db.userAccount.findMany({
      where: {
        OR: [{ id: advisorId }, { id: mainAuthorId }],
      },
    });

    const advisorExists = users.some(
      (user) => user.id === advisorId && user.profile === Profile.Professor,
    );
    const mainAuthorExists = users.some((user) => user.id === mainAuthorId);

    if (advisorId && !advisorExists) {
      throw new AppException('Orientador não encontrado.', 404);
    }

    if (mainAuthorId && !mainAuthorExists) {
      throw new AppException('Autor principal não encontrado.', 404);
    }

    const mainAuthorAlreadySubmitted = await db.submission.findFirst({
      where: { mainAuthorId, eventEditionId },
    });
    if (mainAuthorAlreadySubmitted) {
      throw new AppException(
        'Autor principal já enviou uma submissão para esta edição do evento.',
        400,
      );
    }

    const eventEdition = await db.eventEdition.findUnique({
      where: { id: eventEditionId },
    });
    if (!eventEdition) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    if (new Date() > eventEdition.submissionDeadline) {
      throw new AppException(
        'O prazo para submissão de trabalhos nessa edição do evento já chegou ao fim.',
        400,
      );
    }
    if (new Date() < eventEdition.submissionStartDate) {
      throw new AppException(
        `O evento ainda não está aceitando submissões. Por favor, tente novamente no dia do início das submissões: ${eventEdition.submissionStartDate}.`,
        400,
      );
    }

    const sameTitleExists = await db.submission.findFirst({
      where: { title, eventEditionId },
    });
    if (sameTitleExists) {
      throw new AppException(
        'Já existe uma submissão com o mesmo título para essa edição do evento.',
        400,
      );
    }

    await this.validateProposedSelection(
      db,
      proposedPresentationBlockId,
      eventEditionId,
      proposedPositionWithinBlock,
    );
  }

  async validateUpdate(
    id: string,
    dto: UpdateSubmissionDto,
    existingSubmission: Submission,
    db: Prisma.TransactionClient = this.prismaClient,
  ): Promise<void> {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      proposedPresentationBlockId,
      proposedPositionWithinBlock,
    } = dto;

    if (advisorId) {
      const advisor = await db.userAccount.findUnique({
        where: { id: advisorId },
      });
      if (!advisor || advisor.profile !== Profile.Professor) {
        throw new AppException('Orientador não encontrado.', 404);
      }
    }

    if (mainAuthorId) {
      const mainAuthor = await db.userAccount.findUnique({
        where: { id: mainAuthorId },
      });
      if (!mainAuthor) {
        throw new AppException('Autor principal não encontrado.', 404);
      }

      const duplicate = await db.submission.findFirst({
        where: {
          mainAuthorId,
          eventEditionId: existingSubmission.eventEditionId,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new AppException(
          'Autor principal já submeteu uma apresentação para esta edição do evento.',
          400,
        );
      }
    }

    if (title) {
      const duplicate = await db.submission.findFirst({
        where: {
          title,
          eventEditionId: existingSubmission.eventEditionId,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new AppException(
          'Já existe uma submissão com o mesmo título para essa edição do evento.',
          400,
        );
      }
    }

    if (eventEditionId) {
      const edition = await db.eventEdition.findUnique({
        where: { id: eventEditionId },
      });
      if (!edition) {
        throw new AppException('Edição do evento não encontrada.', 404);
      }
    }

    const selectionChanged =
      proposedPresentationBlockId !== undefined &&
      proposedPresentationBlockId !==
        existingSubmission.proposedPresentationBlockId;
    const effectiveBlockId =
      proposedPresentationBlockId === undefined
        ? existingSubmission.proposedPresentationBlockId
        : proposedPresentationBlockId;
    const effectivePosition =
      proposedPositionWithinBlock !== undefined
        ? proposedPositionWithinBlock
        : selectionChanged
          ? null
          : existingSubmission.proposedPositionWithinBlock;

    if (
      proposedPresentationBlockId !== undefined ||
      proposedPositionWithinBlock !== undefined ||
      eventEditionId !== undefined ||
      dto.status !== undefined
    ) {
      await this.validateProposedSelection(
        db,
        effectiveBlockId,
        eventEditionId ?? existingSubmission.eventEditionId,
        effectivePosition,
        id,
      );
    }
  }

  private async validateProposedSelection(
    db: Prisma.TransactionClient,
    blockId: string | null | undefined,
    eventEditionId: string,
    position?: number | null,
    excludeSubmissionId?: string,
  ): Promise<void> {
    if (!blockId) {
      if (position !== null && position !== undefined) {
        throw new AppException(
          'Informe uma sessão para a posição proposta.',
          400,
        );
      }
      return;
    }

    // Serializa reservas do mesmo bloco para que duas submissões não ocupem a última vaga.
    await db.$queryRaw`SELECT id FROM presentation_block WHERE id = ${blockId} FOR UPDATE`;

    const block = await db.presentationBlock.findUnique({
      where: { id: blockId },
    });
    if (!block) {
      throw new AppException('Sessão de apresentação não encontrada.', 404);
    }
    if (block.eventEditionId !== eventEditionId) {
      throw new AppException(
        'A sessão escolhida pertence a outra edição do evento.',
        400,
      );
    }
    if (block.type !== PresentationBlockType.Presentation) {
      throw new AppException('A sessão escolhida não é de apresentação.', 400);
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: eventEditionId },
    });
    if (!edition) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    const capacity = Math.floor(block.duration / edition.presentationDuration);
    if (position !== null && position !== undefined) {
      if (position < 0 || position >= capacity) {
        throw new AppException('Posição de apresentação inválida.', 400);
      }
      const allocatedAtPosition = await db.presentation.findFirst({
        where: {
          presentationBlockId: blockId,
          positionWithinBlock: position,
          ...(excludeSubmissionId && {
            submissionId: { not: excludeSubmissionId },
          }),
        },
      });
      const proposedAtPosition = await db.submission.findFirst({
        where: {
          proposedPresentationBlockId: blockId,
          proposedPositionWithinBlock: position,
          status: {
            in: [SubmissionStatus.Submitted, SubmissionStatus.Confirmed],
          },
          Presentation: { none: {} },
          ...(excludeSubmissionId && { id: { not: excludeSubmissionId } }),
        },
      });
      if (allocatedAtPosition || proposedAtPosition) {
        throw new AppException(
          'A posição escolhida já está ocupada nesta sessão.',
          409,
        );
      }
    }

    const available = await availableSubmissionSlots(
      db,
      block,
      edition.presentationDuration,
      excludeSubmissionId,
    );
    if (available <= 0) {
      throw new AppException(
        'A sessão escolhida não possui vagas disponíveis.',
        409,
      );
    }
  }
}
