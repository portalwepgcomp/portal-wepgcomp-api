import {
  PresentationStatus,
  Submission,
  SubmissionStatus,
  UserAccount,
} from '@prisma/client';

import { PresentationBlockType } from '@prisma/client';

export class ResponseBlockInfo {
  id: string;
  title: string;
  roomId: string | null;
  startTime: Date;
  type: PresentationBlockType;

  constructor(block: any) {
    this.id = block.id;
    this.title = block.title;
    this.roomId = block.roomId;
    this.startTime = block.startTime;
    this.type = block.type;
  }
}

export class ResponseSubmissionDto {
  id: string;
  advisorId: string;
  mainAuthorId: string;
  mainAuthor?: {
    name: string;
    email: string;
    photoFilePath?: string;
  };
  eventEditionId: string;
  title: string;
  abstract: string;
  pdfFile: string;
  linkHostedFile?: string;
  phoneNumber: string;
  proposedPresentationBlockId?: string;
  proposedPositionWithinBlock?: number;
  proposedStartTime?: Date;
  coAdvisor?: string;
  status: SubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
  advisor?: {
    name: string;
    email: string;
  };
  block: ResponseBlockInfo | null;
  presentationId: string | null;
  presentationStatus: PresentationStatus | null;
  presentationStartTime: Date | null;

  constructor(
    submission: Submission & { mainAuthor?: UserAccount } & {
      advisor?: UserAccount;
    },
    proposedStartTime?: Date,
  ) {
    this.id = submission.id;
    this.advisorId = submission.advisorId;
    this.mainAuthorId = submission.mainAuthorId;
    this.mainAuthor = submission.mainAuthor
      ? {
          name: submission.mainAuthor.name,
          email: submission.mainAuthor.email,
          photoFilePath: submission.mainAuthor.photoFilePath,
        }
      : null;
    this.advisor = submission.advisor
      ? {
          name: submission.advisor.name,
          email: submission.advisor.email,
        }
      : null;
    this.eventEditionId = submission.eventEditionId;
    this.title = submission.title;
    this.abstract = submission.abstract;
    this.pdfFile = submission.pdfFile;
    this.phoneNumber = submission.phoneNumber;
    this.proposedPresentationBlockId = submission.proposedPresentationBlockId;
    this.proposedPositionWithinBlock = submission.proposedPositionWithinBlock;
    this.proposedStartTime = proposedStartTime;
    this.coAdvisor = submission.coAdvisor;
    this.status = submission.status;
    this.createdAt = submission.createdAt;
    this.updatedAt = submission.updatedAt;
    this.linkHostedFile = submission.linkHostedFile;

    const mainPresentation = (submission.Presentation && submission.Presentation.length > 0)
        ? submission.Presentation[0]
        : null;

    if (mainPresentation) {
      this.presentationId = mainPresentation.id;
      this.presentationStatus = mainPresentation.status;
      this.presentationStartTime = mainPresentation.startTime;
      if (mainPresentation.presentationBlock) {
        this.block = new ResponseBlockInfo(mainPresentation.presentationBlock);
      } else {
        this.block = null;
      }
    } else {
      this.presentationId = null;
      this.presentationStatus = null;
      this.presentationStartTime = null;
      this.block = null;
    }
  }
}
