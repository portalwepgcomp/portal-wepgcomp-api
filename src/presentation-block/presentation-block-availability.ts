import {
  PresentationBlockType,
  Prisma,
  SubmissionStatus,
} from '@prisma/client';

type AvailabilityClient = Pick<
  Prisma.TransactionClient,
  'presentation' | 'submission'
>;

type BlockCapacity = {
  id: string;
  type: PresentationBlockType;
  duration: number;
};

export async function occupiedSubmissionSlots(
  db: AvailabilityClient,
  blockId: string,
  excludeSubmissionId?: string,
  excludePresentationId?: string,
): Promise<number> {
  const [allocated, proposed] = await Promise.all([
    db.presentation.count({
      where: {
        presentationBlockId: blockId,
        ...(excludeSubmissionId && {
          submissionId: { not: excludeSubmissionId },
        }),
        ...(excludePresentationId && { id: { not: excludePresentationId } }),
      },
    }),
    db.submission.count({
      where: {
        proposedPresentationBlockId: blockId,
        status: {
          in: [SubmissionStatus.Submitted, SubmissionStatus.Confirmed],
        },
        Presentation: { none: {} },
        ...(excludeSubmissionId && { id: { not: excludeSubmissionId } }),
      },
    }),
  ]);

  return allocated + proposed;
}

/**
 * Propostas ativas sem apresentação alocada também reservam capacidade.
 * Uma apresentação já alocada é contada uma única vez.
 */
export async function availableSubmissionSlots(
  db: AvailabilityClient,
  block: BlockCapacity,
  presentationDuration: number,
  excludeSubmissionId?: string,
  excludePresentationId?: string,
): Promise<number> {
  if (
    block.type !== PresentationBlockType.Presentation ||
    !presentationDuration ||
    presentationDuration <= 0
  ) {
    return 0;
  }

  const totalSlots = Math.floor(block.duration / presentationDuration);
  if (totalSlots <= 0) return 0;

  const occupied = await occupiedSubmissionSlots(
    db,
    block.id,
    excludeSubmissionId,
    excludePresentationId,
  );
  return Math.max(0, totalSlots - occupied);
}
