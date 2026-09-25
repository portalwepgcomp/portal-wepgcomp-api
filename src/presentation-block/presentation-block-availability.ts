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

/**
 * Propostas ativas sem apresentação alocada também reservam capacidade.
 * Uma apresentação já alocada é contada uma única vez.
 */
export async function availableSubmissionSlots(
  db: AvailabilityClient,
  block: BlockCapacity,
  presentationDuration: number,
  excludeSubmissionId?: string,
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

  const [allocated, proposed] = await Promise.all([
    db.presentation.count({
      where: {
        presentationBlockId: block.id,
        ...(excludeSubmissionId && {
          submissionId: { not: excludeSubmissionId },
        }),
      },
    }),
    db.submission.count({
      where: {
        proposedPresentationBlockId: block.id,
        status: {
          in: [SubmissionStatus.Submitted, SubmissionStatus.Confirmed],
        },
        Presentation: { none: {} },
        ...(excludeSubmissionId && { id: { not: excludeSubmissionId } }),
      },
    }),
  ]);

  return Math.max(0, totalSlots - allocated - proposed);
}
