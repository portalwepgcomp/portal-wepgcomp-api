import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  PresentationBlockType,
  PresentationStatus,
  Profile,
  SubmissionStatus,
} from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  availableSubmissionSlots,
  occupiedSubmissionSlots,
} from '../presentation-block/presentation-block-availability';
import { SubmissionService } from '../submission/submission.service';
import {
  BookmarkedPresentationResponseDto,
  BookmarkedPresentationsResponseDto,
  BookmarkPresentationRequestDto,
  BookmarkPresentationResponseDto,
} from './dto/bookmark-presentation.dto';
import { CreatePresentationWithSubmissionDto } from './dto/create-presentation-with-submission.dto';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import { ListAdvisedPresentationsResponse } from './dto/list-advised-presentations.dto';
import { PresentationResponseDto } from './dto/response-presentation.dto';
import { UpdatePresentationWithSubmissionDto } from './dto/update-presentation-with-submission.dto';
import { UpdatePresentationDto } from './dto/update-presentation.dto';
import { PresentationBookmarkService } from './presentation-bookmark.service';
import { PresentationScoringService } from './presentation-scoring.service';

@Injectable()
export class PresentationService {
  private readonly logger = new Logger(PresentationService.name);

  constructor(
    private prismaClient: PrismaService,
    private submissionService: SubmissionService,
    private bookmarkService: PresentationBookmarkService,
    private scoringSubService: PresentationScoringService,
  ) {}

  async create(createPresentationDto: CreatePresentationDto) {
    const { submissionId, presentationBlockId, positionWithinBlock, status } =
      createPresentationDto;

    return this.prismaClient.$transaction(async (tx) => {
      // Mesma ordem de bloqueio usada nas propostas: sessão antes da submissão.
      await tx.$queryRaw`SELECT id FROM presentation_block WHERE id = ${presentationBlockId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM submission WHERE id = ${submissionId} FOR UPDATE`;

      const duplicatePresentation = await tx.presentation.findFirst({
        where: { submissionId },
      });
      if (duplicatePresentation) {
        throw new AppException('Apresentação já cadastrada.', 400);
      }

      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
      });
      if (!submission) {
        throw new AppException('Submissão não encontrada.', 404);
      }

      await this.validateAllocation(
        tx,
        presentationBlockId,
        positionWithinBlock,
        submissionId,
        submission.eventEditionId,
      );

      if (submission.status !== SubmissionStatus.Confirmed) {
        await tx.submission.update({
          where: { id: submissionId },
          data: { status: SubmissionStatus.Confirmed },
        });
      }

      return tx.presentation.create({
        data: {
          ...createPresentationDto,
          status: status ?? PresentationStatus.ToPresent,
        },
      });
    });
  }

  async createWithSubmission(
    createPresentationWithSubmissionDto: CreatePresentationWithSubmissionDto,
  ) {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      abstractText,
      pdfFile,
      phoneNumber,
      coAdvisor,
      presentationBlockId,
      positionWithinBlock,
      status,
    } = createPresentationWithSubmissionDto;

    let createdSubmission;
    try {
      createdSubmission = await this.submissionService.create({
        advisorId,
        mainAuthorId,
        eventEditionId,
        title,
        abstractText,
        pdfFile,
        phoneNumber,
        proposedPresentationBlockId: presentationBlockId,
        proposedPositionWithinBlock: positionWithinBlock,
        status: SubmissionStatus.Confirmed,
        coAdvisor,
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException('Erro ao criar a submissão.', 500);
    }

    if (!presentationBlockId || positionWithinBlock === undefined) {
      return {
        submission: createdSubmission,
      };
    }

    const presentationStatus = status || PresentationStatus.ToPresent;

    let createdPresentation;
    try {
      createdPresentation = await this.create({
        submissionId: createdSubmission.id,
        presentationBlockId,
        positionWithinBlock,
        status: presentationStatus,
      });
    } catch (error) {
      await this.submissionService.remove(createdSubmission.id);

      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException('Erro ao criar a apresentação.', 500);
    }

    return {
      submission: createdSubmission,
      presentation: createdPresentation,
    };
  }

  async findAllByEventEditionId(eventEditionId: string) {
    const presentations = await this.prismaClient.presentation.findMany({
      where: {
        submission: {
          eventEditionId,
        },
      },
      include: {
        submission: {
          include: {
            mainAuthor: true,
            advisor: true,
          },
        },
      },
    });

    const presentationResponseDtos: PresentationResponseDto[] = [];

    for (const presentation of presentations) {
      const presentationTime = await this.calculatePresentationStartTime(
        presentation.presentationBlockId,
        presentation.positionWithinBlock,
      );

      presentationResponseDtos.push(
        new PresentationResponseDto(presentation, presentationTime),
      );
    }

    return presentationResponseDtos;
  }

  async findOne(id: string) {
    const presentation = await this.prismaClient.presentation.findUnique({
      where: { id },
      include: {
        submission: {
          include: {
            mainAuthor: true,
            advisor: true,
          },
        },
      },
    });

    if (!presentation)
      throw new AppException('Apresentação não encontrada.', 404);

    const presentationTime = await this.calculatePresentationStartTime(
      presentation.presentationBlockId,
      presentation.positionWithinBlock,
    );

    return new PresentationResponseDto(presentation, presentationTime);
  }

  async update(id: string, updatePresentationDto: UpdatePresentationDto) {
    return this.prismaClient.$transaction(async (tx) => {
      let existing = await tx.presentation.findUnique({ where: { id } });
      if (!existing) {
        throw new AppException('Apresentação não encontrada.', 404);
      }

      const { submissionId, presentationBlockId, positionWithinBlock } =
        updatePresentationDto;
      const allocationChanged =
        submissionId !== undefined ||
        presentationBlockId !== undefined ||
        positionWithinBlock !== undefined;

      let allocationCapacity: number | undefined;
      if (allocationChanged) {
        const blockId = presentationBlockId ?? existing.presentationBlockId;
        await tx.$queryRaw`SELECT id FROM presentation_block WHERE id = ${blockId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM presentation WHERE id = ${id} FOR UPDATE`;
        existing = await tx.presentation.findUnique({ where: { id } });
        if (!existing) {
          throw new AppException('Apresentação não encontrada.', 404);
        }
        if (
          presentationBlockId === undefined &&
          existing.presentationBlockId !== blockId
        ) {
          throw new AppException(
            'A apresentação foi alterada. Recarregue e tente novamente.',
            409,
          );
        }
        const authorSubmissionId = submissionId ?? existing.submissionId;
        const position = positionWithinBlock ?? existing.positionWithinBlock;
        await tx.$queryRaw`SELECT id FROM submission WHERE id = ${authorSubmissionId} FOR UPDATE`;

        const duplicate = await tx.presentation.findFirst({
          where: { submissionId: authorSubmissionId, NOT: { id } },
        });
        if (duplicate) {
          throw new AppException('Apresentação já cadastrada.', 400);
        }

        const submission = await tx.submission.findUnique({
          where: { id: authorSubmissionId },
        });
        if (!submission) {
          throw new AppException('Submissão não encontrada.', 404);
        }
        if (submission.status !== SubmissionStatus.Confirmed) {
          throw new AppException('Submissão não confirmada.', 400);
        }

        allocationCapacity = await this.validateAllocation(
          tx,
          blockId,
          position,
          authorSubmissionId,
          submission.eventEditionId,
          id,
        );
      }

      const updated = await tx.presentation.update({
        where: { id },
        data: updatePresentationDto,
      });
      if (allocationCapacity !== undefined) {
        const occupied = await occupiedSubmissionSlots(
          tx,
          updated.presentationBlockId,
        );
        if (occupied > allocationCapacity) {
          throw new AppException(
            'A sessão escolhida não possui vagas disponíveis.',
            409,
          );
        }
      }
      return updated;
    });
  }

  private async validateAllocation(
    tx: Prisma.TransactionClient,
    blockId: string,
    position: number,
    submissionId: string,
    eventEditionId: string,
    presentationId?: string,
  ): Promise<number> {
    const block = await tx.presentationBlock.findUnique({
      where: { id: blockId },
    });
    if (!block) {
      throw new AppException('Bloco de apresentação não encontrado.', 404);
    }
    if (block.type !== PresentationBlockType.Presentation) {
      throw new AppException('A sessão escolhida não é de apresentação.', 400);
    }
    if (block.eventEditionId !== eventEditionId) {
      throw new AppException(
        'A sessão escolhida pertence a outra edição do evento.',
        400,
      );
    }
    const edition = await tx.eventEdition.findUnique({
      where: { id: block.eventEditionId },
    });
    if (!edition) {
      throw new AppException('Evento não encontrado.', 404);
    }

    const capacity = Math.floor(block.duration / edition.presentationDuration);
    if (!Number.isInteger(position) || position < 0 || position >= capacity) {
      throw new AppException('Posição de apresentação inválida.', 400);
    }

    const overlaps = await tx.presentation.findFirst({
      where: {
        presentationBlockId: blockId,
        positionWithinBlock: position,
        ...(presentationId && { NOT: { id: presentationId } }),
      },
    });
    if (overlaps) {
      throw new AppException('Posição de apresentação já ocupada.', 400);
    }
    const proposedAtPosition = await tx.submission.findFirst({
      where: {
        proposedPresentationBlockId: blockId,
        proposedPositionWithinBlock: position,
        status: {
          in: [SubmissionStatus.Submitted, SubmissionStatus.Confirmed],
        },
        Presentation: { none: {} },
        id: { not: submissionId },
      },
    });
    if (proposedAtPosition) {
      throw new AppException('A posição escolhida já está reservada.', 409);
    }
    const available = await availableSubmissionSlots(
      tx,
      block,
      edition.presentationDuration,
      submissionId,
      presentationId,
    );
    if (available <= 0) {
      throw new AppException(
        'A sessão escolhida não possui vagas disponíveis.',
        409,
      );
    }
    return capacity;
  }

  async updateWithSubmission(
    id: string,
    updatePresentationWithSubmissionDto: UpdatePresentationWithSubmissionDto,
  ) {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      abstractText,
      pdfFile,
      phoneNumber,
      coAdvisor,
      presentationBlockId,
      positionWithinBlock,
      status,
    } = updatePresentationWithSubmissionDto;

    const existingPresentation =
      await this.prismaClient.presentation.findUnique({
        where: { id },
      });

    if (!existingPresentation)
      throw new AppException('Apresentação não encontrada.', 404);

    let updatedSubmission;
    try {
      updatedSubmission = await this.submissionService.update(
        existingPresentation.submissionId,
        {
          advisorId,
          mainAuthorId,
          eventEditionId,
          title,
          abstractText,
          pdfFile,
          phoneNumber,
          coAdvisor,
        },
      );
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException('Erro ao atualizar a submissão.', 500);
    }

    let updatedPresentation;
    try {
      updatedPresentation = await this.update(id, {
        presentationBlockId,
        positionWithinBlock,
        status,
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException('Erro ao atualizar a apresentação.', 500);
    }

    return {
      submission: updatedSubmission,
      presentation: updatedPresentation,
    };
  }

  async remove(id: string) {
    const existingPresentation =
      await this.prismaClient.presentation.findUnique({
        where: { id },
      });
    if (!existingPresentation)
      throw new AppException('Apresentação não encontrada.', 404);

    await this.prismaClient.presentation.delete({
      where: { id },
    });

    return { message: 'Apresentação removida com sucesso.' };
  }

  async listUserPresentations(userId: string) {
    const submissions = await this.prismaClient.submission.findMany({
      where: { mainAuthorId: userId },
      include: { Presentation: true },
    });

    const presentations = submissions.flatMap(
      (submission) => submission.Presentation,
    );

    return presentations;
  }

  async listAdvisedPresentations(
    userId: string,
  ): Promise<Array<ListAdvisedPresentationsResponse>> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    if (user.profile !== Profile.Professor) {
      throw new AppException('Usuário não é um professor.', 403);
    }

    const submissions = await this.prismaClient.submission.findMany({
      where: { advisorId: userId },
      include: { Presentation: true },
    });

    return submissions.flatMap((submission) =>
      submission.Presentation.map((p) => ({
        ...p,
        publicAverageScore: p.publicAverageScore ?? undefined,
        evaluatorsAverageScore: p.evaluatorsAverageScore ?? undefined,
      })),
    );
  }

  async updatePresentationForUser(
    userId: string,
    presentationId: string,
    dto: UpdatePresentationDto,
  ) {
    const presentation = await this.prismaClient.presentation.findFirst({
      where: {
        id: presentationId,
        submission: { mainAuthorId: userId },
      },
    });

    if (!presentation) {
      throw new AppException(
        'Apresentação não encontrada ou não pertence ao usuário.',
        404,
      );
    }

    return this.update(presentationId, dto);
  }

  private async calculatePresentationStartTime(
    presentationBlockId: string,
    positionWithinBlock: number,
  ): Promise<Date> {
    const presentationBlock =
      await this.prismaClient.presentationBlock.findUnique({
        where: { id: presentationBlockId },
      });

    if (!presentationBlock)
      throw new AppException('Bloco de apresentação não encontrado.', 404);

    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: { id: presentationBlock.eventEditionId },
    });

    if (!eventEdition) throw new AppException('Evento não encontrado.', 404);

    const presentationDuration = eventEdition.presentationDuration;
    const startTime = presentationBlock.startTime;

    const presentationTime = new Date(startTime);
    presentationTime.setMinutes(
      presentationTime.getMinutes() +
        positionWithinBlock * presentationDuration,
    );

    return presentationTime;
  }

  bookmarkPresentation(
    bookmarkPresentationRequestDto: BookmarkPresentationRequestDto,
    userId: string,
  ): Promise<BookmarkPresentationResponseDto> {
    return this.bookmarkService.bookmarkPresentation(
      bookmarkPresentationRequestDto,
      userId,
    );
  }

  bookmarkedPresentation(
    userId: string,
    presentationId: string,
  ): Promise<BookmarkedPresentationResponseDto> {
    return this.bookmarkService.bookmarkedPresentation(userId, presentationId);
  }

  bookmarkedPresentations(
    userId: string,
    eventEditionId: string,
  ): Promise<BookmarkedPresentationsResponseDto> {
    return this.bookmarkService.bookmarkedPresentations(userId, eventEditionId);
  }

  removePresentationBookmark(
    presentationId: string,
    userId: string,
  ): Promise<BookmarkedPresentationsResponseDto> {
    return this.bookmarkService.removePresentationBookmark(
      presentationId,
      userId,
    );
  }

  recalculateAllScores(eventEditionId: string): Promise<void> {
    return this.scoringSubService.recalculateAllScores(eventEditionId);
  }

  resetEvaluatorsScores(eventEditionId: string): Promise<void> {
    return this.scoringSubService.resetEvaluatorsScores(eventEditionId);
  }

  resetPublicScores(eventEditionId: string): Promise<void> {
    return this.scoringSubService.resetPublicScores(eventEditionId);
  }

  resetCommitteeScores(eventEditionId: string): Promise<void> {
    return this.scoringSubService.resetCommitteeScores(eventEditionId);
  }

  calculateScoresForActiveEvent() {
    return this.scoringSubService.calculateScoresForActiveEvent();
  }
}
