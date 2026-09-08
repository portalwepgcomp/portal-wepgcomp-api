import { Injectable } from '@nestjs/common';
import { PresentationStatus, Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SwapMultiplePresentationsDto } from './dto/swap-presentations.dto';

@Injectable()
export class PresentationBlockAllocationService {
  constructor(private readonly prismaClient: PrismaService) {}

  async allocateSubmissionsAndPanelistsOnCreate(
    tx: Prisma.TransactionClient,
    blockId: string,
    submissions?: string[],
    panelists?: string[],
    numPresentations?: number,
  ): Promise<void> {
    if (
      submissions &&
      submissions.length > 0 &&
      submissions.length <= (numPresentations ?? 0)
    ) {
      const submissionsExist = await tx.submission.findMany({
        where: {
          id: {
            in: submissions,
          },
        },
      });

      if (submissionsExist.length !== submissions.length) {
        throw new AppException('Um dos trabalhos informados não existe', 404);
      }

      const submissionsExistIds = submissionsExist.map(
        (submission) => submission.id,
      );
      // make sure they are in the same order
      submissionsExistIds.sort(
        (a, b) => submissions.indexOf(a) - submissions.indexOf(b),
      );

      // for each submission, find the presentation that is tied to it
      const presentations = await tx.presentation.findMany({
        where: {
          submissionId: {
            in: submissionsExistIds,
          },
        },
      });

      const submissionsWithoutPresentation = submissionsExistIds.filter(
        (submission) =>
          !presentations.some(
            (presentation) => presentation.submissionId === submission,
          ),
      );

      // now for each presentation, make an update to the positionWithinBlock
      for (const presentation of presentations) {
        await tx.presentation.update({
          where: {
            id: presentation.id,
          },
          data: {
            positionWithinBlock: submissionsExistIds.indexOf(
              presentation.submissionId,
            ),
            presentationBlockId: blockId,
          },
        });
      }

      // Create presentations for each submission that doesn't have one
      await tx.presentation.createMany({
        data: submissionsWithoutPresentation.map((submission) => ({
          submissionId: submission,
          presentationBlockId: blockId,
          positionWithinBlock: submissionsExistIds.indexOf(submission),
          status: PresentationStatus.ToPresent,
        })),
      });
    }

    // Creating panelist records
    if (panelists && panelists.length > 0) {
      const panelistsExist = await tx.userAccount.findMany({
        where: {
          id: {
            in: panelists,
          },
        },
      });

      if (panelistsExist.length !== panelists.length) {
        throw new AppException('Um dos avaliadores informados não existe', 404);
      }

      await tx.panelist.createMany({
        data: panelists.map((userId) => ({
          userId,
          presentationBlockId: blockId,
        })),
      });
    }
  }

  async allocateSubmissionsAndPanelistsOnUpdate(
    tx: Prisma.TransactionClient,
    blockId: string,
    submissions?: string[],
    panelists?: string[],
  ): Promise<void> {
    if (submissions && submissions.length > 0) {
      // Find existing submissions
      const submissionsExist = await tx.submission.findMany({
        where: {
          id: { in: submissions },
        },
      });

      if (submissionsExist.length !== submissions.length) {
        throw new AppException('Um dos trabalhos informados não existe', 404);
      }

      // Sort submissions to maintain order
      const submissionsExistIds = submissionsExist.map((sub) => sub.id);
      submissionsExistIds.sort(
        (a, b) => submissions.indexOf(a) - submissions.indexOf(b),
      );

      // Find presentations currently in this block
      const currentBlockPresentations = await tx.presentation.findMany({
        where: { presentationBlockId: blockId },
      });

      // Update existing presentations that remain in list
      const existingPresentationsForNewList = currentBlockPresentations.filter(
        (p) => submissionsExistIds.includes(p.submissionId),
      );

      for (const presentation of existingPresentationsForNewList) {
        await tx.presentation.update({
          where: { id: presentation.id },
          data: {
            positionWithinBlock: submissionsExistIds.indexOf(
              presentation.submissionId,
            ),
            presentationBlockId: blockId,
          },
        });
      }

      // Create new presentations for submissions sem apresentação
      const submissionsWithoutPresentation = submissionsExistIds.filter(
        (subId) =>
          !existingPresentationsForNewList.some(
            (pres) => pres.submissionId === subId,
          ),
      );

      if (submissionsWithoutPresentation.length > 0) {
        await tx.presentation.createMany({
          data: submissionsWithoutPresentation.map((submissionId) => ({
            submissionId,
            presentationBlockId: blockId,
            positionWithinBlock: submissionsExistIds.indexOf(submissionId),
            status: PresentationStatus.ToPresent,
          })),
        });
      }

      // DELETE: remover apresentações que foram retiradas da lista
      const presentationsToDelete = currentBlockPresentations.filter(
        (p) => !submissionsExistIds.includes(p.submissionId),
      );

      if (presentationsToDelete.length > 0) {
        await tx.presentation.deleteMany({
          where: {
            id: { in: presentationsToDelete.map((p) => p.id) },
          },
        });
      }
    } else {
      // Se não há submissions, apague todas as apresentações do bloco
      await tx.presentation.deleteMany({
        where: {
          presentationBlockId: blockId,
        },
      });
    }

    // Gerenciar avaliadores/panelists
    if (panelists && panelists.length > 0) {
      await tx.panelist.deleteMany({
        where: {
          presentationBlockId: blockId,
        },
      });

      const panelistsExist = await tx.userAccount.findMany({
        where: {
          id: {
            in: panelists,
          },
        },
      });

      if (panelistsExist.length !== panelists.length) {
        throw new AppException('Um dos avaliadores informados não existe', 404);
      }

      await tx.panelist.createMany({
        data: panelists.map((userId) => ({
          userId,
          presentationBlockId: blockId,
        })),
      });
    } else {
      await tx.panelist.deleteMany({
        where: {
          presentationBlockId: blockId,
        },
      });
    }
  }

  async swapPresentations(
    id: string,
    swapMultiplePresentationsDto: SwapMultiplePresentationsDto,
  ): Promise<{ message: string }> {
    for (const swapPresentationDto of swapMultiplePresentationsDto.presentations) {
      const { presentation1Id, presentation2Id } = swapPresentationDto;

      const presentation1 = await this.prismaClient.presentation.findUnique({
        where: {
          id: presentation1Id,
        },
      });

      if (!presentation1 || presentation1.presentationBlockId !== id) {
        throw new AppException(
          'Apresentação 1 não foi encontrada nesse bloco',
          400,
        );
      }

      const presentation2 = await this.prismaClient.presentation.findUnique({
        where: {
          id: presentation2Id,
        },
      });

      if (!presentation2 || presentation2.presentationBlockId !== id) {
        throw new AppException(
          'Apresentação 2 não foi encontrada nesse bloco',
          400,
        );
      }

      const presentation1Position = presentation1.positionWithinBlock;
      const presentation2Position = presentation2.positionWithinBlock;

      try {
        await this.prismaClient.$transaction([
          this.prismaClient.presentation.update({
            where: { id: presentation1Id },
            data: { positionWithinBlock: presentation2Position },
          }),
          this.prismaClient.presentation.update({
            where: { id: presentation2Id },
            data: { positionWithinBlock: presentation1Position },
          }),
        ]);
      } catch {
        throw new AppException('Erro interno na troca de apresentações', 500);
      }
    }

    return {
      message: 'Apresentações trocadas com sucesso',
    };
  }
}
