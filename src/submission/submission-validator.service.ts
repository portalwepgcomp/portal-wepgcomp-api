import { Injectable } from '@nestjs/common';
import { Profile, Submission } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

@Injectable()
export class SubmissionValidatorService {
  constructor(private readonly prismaClient: PrismaService) {}

  async validateCreate(dto: CreateSubmissionDto): Promise<void> {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      proposedPresentationBlockId,
      proposedPositionWithinBlock,
    } = dto;

    const users = await this.prismaClient.userAccount.findMany({
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

    const mainAuthorAlreadySubmitted =
      await this.prismaClient.submission.findFirst({
        where: {
          mainAuthorId,
          eventEditionId,
        },
      });

    if (mainAuthorAlreadySubmitted) {
      throw new AppException(
        'Autor principal já enviou uma submissão para esta edição do evento.',
        400,
      );
    }

    const eventEditionExists = await this.prismaClient.eventEdition.findUnique({
      where: { id: eventEditionId },
    });

    if (!eventEditionExists) {
      throw new AppException('Edição do evento não encontrada.', 404);
    }

    const submissionDeadline = eventEditionExists.submissionDeadline;
    if (new Date() > submissionDeadline) {
      throw new AppException(
        'O prazo para submissão de trabalhos nessa edição do evento já chegou ao fim.',
        400,
      );
    } else if (new Date() < eventEditionExists.submissionStartDate) {
      throw new AppException(
        `O evento ainda não está aceitando submissões. Por favor, tente novamente no dia do início das submissões: ${eventEditionExists.submissionStartDate}.`,
        400,
      );
    }

    const sameTitleExists = await this.prismaClient.submission.findFirst({
      where: {
        title,
        eventEditionId,
      },
    });

    if (sameTitleExists) {
      throw new AppException(
        'Já existe uma submissão com o mesmo título para essa edição do evento.',
        400,
      );
    }

    if (
      proposedPresentationBlockId &&
      proposedPositionWithinBlock !== undefined
    ) {
      await this.validateProposedPosition(
        proposedPresentationBlockId,
        proposedPositionWithinBlock,
        eventEditionExists.presentationDuration,
      );
    }
  }

  async validateUpdate(
    id: string,
    dto: UpdateSubmissionDto,
    existingSubmission: Submission,
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
      const advisorExists = await this.prismaClient.userAccount.findUnique({
        where: { id: advisorId },
      });
      if (!advisorExists || advisorExists.profile !== Profile.Professor) {
        throw new AppException('Orientador não encontrado.', 404);
      }
    }

    if (mainAuthorId) {
      const mainAuthorExists = await this.prismaClient.userAccount.findUnique({
        where: { id: mainAuthorId },
      });
      if (!mainAuthorExists) {
        throw new AppException('Autor principal não encontrado.', 404);
      }

      const mainAuthorAlreadySubmitted =
        await this.prismaClient.submission.findFirst({
          where: {
            mainAuthorId,
            eventEditionId: existingSubmission.eventEditionId,
            NOT: { id },
          },
        });

      if (mainAuthorAlreadySubmitted) {
        throw new AppException(
          'Autor principal já submeteu uma apresentação para esta edição do evento.',
          400,
        );
      }
    }

    if (title) {
      const sameTitleExists = await this.prismaClient.submission.findFirst({
        where: {
          title,
          eventEditionId: existingSubmission.eventEditionId,
          NOT: { id },
        },
      });

      if (sameTitleExists) {
        throw new AppException(
          'Já existe uma submissão com o mesmo título para essa edição do evento.',
          400,
        );
      }
    }

    if (eventEditionId) {
      const eventEditionExists =
        await this.prismaClient.eventEdition.findUnique({
          where: { id: eventEditionId },
        });
      if (!eventEditionExists) {
        throw new AppException('Edição do evento não encontrada.', 404);
      }
    }

    if (
      proposedPresentationBlockId &&
      proposedPositionWithinBlock !== undefined
    ) {
      const proposedPresentationBlockExists =
        await this.prismaClient.presentationBlock.findUnique({
          where: { id: proposedPresentationBlockId },
        });

      if (!proposedPresentationBlockExists) {
        throw new AppException('Bloco de apresentação não encontrado.', 404);
      }

      const eventEdition = await this.prismaClient.eventEdition.findUnique({
        where: { id: proposedPresentationBlockExists.eventEditionId },
      });

      if (!eventEdition) {
        throw new AppException('Edição do evento não encontrada.', 404);
      }

      await this.validateProposedPosition(
        proposedPresentationBlockId,
        proposedPositionWithinBlock,
        eventEdition.presentationDuration,
        id,
      );
    }
  }

  async validateProposedPosition(
    proposedPresentationBlockId: string,
    proposedPositionWithinBlock: number,
    presentationDuration: number,
    excludeSubmissionId?: string,
  ): Promise<void> {
    const presentationBlockExists =
      await this.prismaClient.presentationBlock.findUnique({
        where: { id: proposedPresentationBlockId },
      });

    if (!presentationBlockExists) {
      throw new AppException('Bloco de apresentação não encontrado.', 404);
    }

    const blockDuration = presentationBlockExists.duration;
    const maxPositionWithinBlock =
      Math.floor(blockDuration / presentationDuration) - 1;
    if (proposedPositionWithinBlock > maxPositionWithinBlock) {
      throw new AppException('Posição de apresentação inválida.', 400);
    }

    const presentationExists = await this.prismaClient.presentation.findFirst({
      where: {
        presentationBlockId: proposedPresentationBlockId,
        positionWithinBlock: proposedPositionWithinBlock,
        ...(excludeSubmissionId && {
          NOT: { submissionId: excludeSubmissionId },
        }),
      },
    });

    if (presentationExists) {
      throw new AppException(
        'Já existe uma apresentação aceita nesta posição do bloco.',
        400,
      );
    }
  }
}
