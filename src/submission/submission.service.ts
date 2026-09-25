import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Submission,
  SubmissionStatus,
  UserLevel,
} from '@prisma/client';
import { UploadsService } from '../uploads/uploads.service';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponseDto } from '../shared/dto/paginated-response.dto';
import { ListItemActions } from '../shared/interfaces/list-item-actions.interface';
import { canManageOwned, RequestingUser } from '../shared/utils/permissions';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ResponseSubmissionDto } from './dto/response-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionValidatorService } from './submission-validator.service';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private readonly prismaClient: PrismaService,
    private readonly uploadService: UploadsService,
    private readonly validatorService: SubmissionValidatorService,
  ) {}

  async create(createSubmissionDto: CreateSubmissionDto) {
    return this.prismaClient.$transaction(async (tx) => {
      await this.validatorService.validateCreate(createSubmissionDto, tx);

      const {
        advisorId,
        mainAuthorId,
        eventEditionId,
        title,
        abstractText,
        pdfFile,
        phoneNumber,
        proposedPresentationBlockId,
        proposedPositionWithinBlock,
        status,
        coAdvisor,
        linkHostedFile,
      } = createSubmissionDto;

      return tx.submission.create({
        data: {
          advisorId,
          mainAuthorId,
          eventEditionId,
          title,
          abstract: abstractText,
          pdfFile,
          phoneNumber,
          proposedPresentationBlockId,
          proposedPositionWithinBlock,
          status: status || SubmissionStatus.Submitted,
          coAdvisor,
          linkHostedFile,
        },
      });
    });
  }
  /**
   * Lista submissões com suporte a busca textual, filtros de visibilidade
   * e paginação server-side com envelope (P3.2).
   */
  async findAll(
    eventEditionId: string,
    withoutPresentation: boolean,
    orderByProposedPresentation: boolean,
    showConfirmedOnly: boolean,
    mainAuthorId?: string,
    search?: string,
    requestingUser?: RequestingUser,
    page?: number,
    pageSize?: number,
    paginated?: false,
  ): Promise<ResponseSubmissionDto[]>;
  async findAll(
    eventEditionId: string,
    withoutPresentation: boolean,
    orderByProposedPresentation: boolean,
    showConfirmedOnly: boolean,
    mainAuthorId?: string,
    search?: string,
    requestingUser?: RequestingUser,
    page?: number,
    pageSize?: number,
    paginated?: true,
  ): Promise<PaginatedResponseDto<ResponseSubmissionDto>>;
  async findAll(
    eventEditionId: string,
    withoutPresentation: boolean,
    orderByProposedPresentation: boolean,
    showConfirmedOnly: boolean,
    mainAuthorId?: string,
    search?: string,
    requestingUser?: RequestingUser,
    page?: number,
    pageSize?: number,
    paginated?: boolean,
  ): Promise<
    ResponseSubmissionDto[] | PaginatedResponseDto<ResponseSubmissionDto>
  >;
  async findAll(
    eventEditionId: string,
    withoutPresentation: boolean,
    orderByProposedPresentation: boolean,
    showConfirmedOnly: boolean,
    mainAuthorId?: string,
    search?: string,
    requestingUser?: RequestingUser,
    page?: number,
    pageSize?: number,
    paginated?: boolean,
  ): Promise<
    ResponseSubmissionDto[] | PaginatedResponseDto<ResponseSubmissionDto>
  > {
    // Anti-spoofing: usuário Default só enxerga as próprias submissões,
    // ignorando qualquer mainAuthorId enviado na query. Regra que antes vivia
    // no front (apresentacoes/page.tsx) agora é imposta no servidor.
    const effectiveMainAuthorId =
      requestingUser?.level === UserLevel.Default
        ? requestingUser.userId
        : mainAuthorId;

    const searchTerm = search?.trim();

    const where: Prisma.SubmissionWhereInput = {
      eventEditionId: eventEditionId,
      ...(withoutPresentation && { Presentation: { none: {} } }),
      ...(showConfirmedOnly && { status: SubmissionStatus.Confirmed }),
      ...(effectiveMainAuthorId && { mainAuthorId: effectiveMainAuthorId }),
      ...(searchTerm && {
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          {
            mainAuthor: { name: { contains: searchTerm, mode: 'insensitive' } },
          },
          {
            mainAuthor: {
              email: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        ],
      }),
    };

    const total =
      typeof this.prismaClient.submission?.count === 'function'
        ? await this.prismaClient.submission.count({ where })
        : 0;

    const isPaginatedRequested =
      paginated === true || (page !== undefined && pageSize !== undefined);
    const currentPage = page && page > 0 ? page : 1;
    const limit = pageSize && pageSize > 0 ? pageSize : 20;
    const skip = isPaginatedRequested ? (currentPage - 1) * limit : undefined;
    const take = isPaginatedRequested ? limit : undefined;

    const submissions = await this.prismaClient.submission.findMany({
      where,
      skip,
      take,
      orderBy: orderByProposedPresentation
        ? [
            { proposedPresentationBlockId: { sort: 'asc', nulls: 'last' } },
            { proposedPositionWithinBlock: { sort: 'asc', nulls: 'last' } },
          ]
        : undefined,
      include: {
        mainAuthor: true,
        advisor: true,
        Presentation: {
          include: {
            presentationBlock: true,
          },
        },
      },
    });

    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: { id: eventEditionId },
      select: { presentationDuration: true },
    });
    const presentationDurationMinutes = eventEdition?.presentationDuration ?? 0;

    const proposedBlockIds = Array.from(
      new Set(
        submissions
          .map((s) => s.proposedPresentationBlockId)
          .filter((id): id is string => !!id),
      ),
    );
    const proposedBlocks = proposedBlockIds.length
      ? await this.prismaClient.presentationBlock.findMany({
          where: { id: { in: proposedBlockIds } },
          select: { id: true, startTime: true },
        })
      : [];
    const blockStartTimeById = new Map(
      proposedBlocks.map((b) => [b.id, b.startTime]),
    );

    const items = submissions.map((submission) => {
      const proposedStartTime = this.computeProposedStartTime(
        submission.proposedPresentationBlockId,
        submission.proposedPositionWithinBlock,
        submission.proposedPresentationBlockId
          ? blockStartTimeById.get(submission.proposedPresentationBlockId)
          : null,
        presentationDurationMinutes,
      );

      const canManage = canManageOwned(requestingUser, submission.mainAuthorId);
      const actions: ListItemActions = {
        canEdit: canManage,
        canDelete: canManage,
        canDownload: !!(submission.pdfFile || submission.linkHostedFile),
      };

      return new ResponseSubmissionDto(submission, proposedStartTime, actions);
    });

    if (paginated) {
      return PaginatedResponseDto.create(items, total, currentPage, limit);
    }

    return items;
  }

  async findOne(id: string): Promise<ResponseSubmissionDto> {
    const submission = await this.prismaClient.submission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new AppException('Submissão não encontrada.', 404);
    }

    const proposedStartTime = await this.calculateProposedStartTime(
      submission,
      submission.eventEditionId,
    );

    return new ResponseSubmissionDto(submission, proposedStartTime);
  }

  async downloadPdf(id: string, res: Response) {
    const submission = await this.prismaClient.submission.findUnique({
      where: { id },
      select: { pdfFile: true },
    });

    if (!submission) {
      throw new AppException('Submissão não encontrada.', 404);
    }

    return this.uploadService.downloadFile(submission.pdfFile, res);
  }

  async update(id: string, updateSubmissionDto: UpdateSubmissionDto) {
    const {
      advisorId,
      mainAuthorId,
      eventEditionId,
      title,
      abstractText,
      pdfFile,
      phoneNumber,
      proposedPresentationBlockId,
      proposedPositionWithinBlock,
      status,
      coAdvisor,
      linkHostedFile,
    } = updateSubmissionDto;

    const { updated, previousPdf } = await this.prismaClient.$transaction(
      async (tx) => {
        const existingSubmission = await tx.submission.findUnique({
          where: { id },
        });
        if (!existingSubmission) {
          throw new AppException('Submissão não encontrada.', 404);
        }

        const selectionChanged =
          proposedPresentationBlockId !== undefined &&
          proposedPresentationBlockId !==
            existingSubmission.proposedPresentationBlockId;
        const nextPosition =
          proposedPositionWithinBlock !== undefined
            ? proposedPositionWithinBlock
            : selectionChanged
              ? null
              : undefined;
        await this.validatorService.validateUpdate(
          id,
          { ...updateSubmissionDto, proposedPositionWithinBlock: nextPosition },
          existingSubmission,
          tx,
        );

        const updated = await tx.submission.update({
          where: { id },
          data: {
            advisorId,
            mainAuthorId,
            eventEditionId,
            title,
            abstract: abstractText,
            pdfFile,
            phoneNumber,
            proposedPresentationBlockId,
            proposedPositionWithinBlock: nextPosition,
            status: status ?? existingSubmission.status,
            coAdvisor,
            linkHostedFile,
          },
        });
        return {
          updated,
          previousPdf:
            pdfFile && existingSubmission.pdfFile !== pdfFile
              ? existingSubmission.pdfFile
              : null,
        };
      },
    );

    // A limpeza ocorre após o commit: uma disputa por vaga não pode apagar o PDF atual.
    if (previousPdf) {
      const oldPdfPath = path.join(process.cwd(), 'storage', previousPdf);
      if (fs.existsSync(oldPdfPath)) {
        try {
          fs.unlinkSync(oldPdfPath);
        } catch (error) {
          this.logger.warn(
            `Não foi possível remover o PDF antigo da submissão ${id}: ${error}`,
          );
        }
      }
    }

    return updated;
  }
  async remove(id: string) {
    const submission = await this.prismaClient.submission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new AppException('Submissão não encontrada.', 404);
    }

    const { success } = await this.uploadService.deleteFile(submission.pdfFile);
    if (!success) {
      this.logger.error(
        `Falha ao deletar o arquivo PDF associado à submissão ${id} | caminho do arquivo: ${submission.pdfFile}`,
      );
    }

    return this.prismaClient.submission.delete({
      where: { id },
    });
  }

  private async calculateProposedStartTime(
    submission: Submission,
    eventEditionId: string,
  ): Promise<Date | null> {
    if (!submission.proposedPresentationBlockId) {
      return null;
    }

    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: { id: eventEditionId },
      select: { presentationDuration: true },
    });

    const presentationBlock =
      await this.prismaClient.presentationBlock.findUnique({
        where: { id: submission.proposedPresentationBlockId },
        select: { startTime: true },
      });

    return this.computeProposedStartTime(
      submission.proposedPresentationBlockId,
      submission.proposedPositionWithinBlock,
      presentationBlock?.startTime,
      eventEdition?.presentationDuration ?? 0,
    );
  }

  /**
   * Função pura: calcula o horário proposto a partir de dados já carregados.
   * Usada tanto na listagem (batelada) quanto em `findOne`, evitando o N+1.
   */
  private computeProposedStartTime(
    proposedPresentationBlockId: string | null,
    proposedPositionWithinBlock: number | null | undefined,
    blockStartTime: Date | null | undefined,
    presentationDurationMinutes: number,
  ): Date | null {
    if (!proposedPresentationBlockId) {
      return null;
    }
    if (
      !blockStartTime ||
      proposedPositionWithinBlock === null ||
      proposedPositionWithinBlock === undefined
    ) {
      return null;
    }

    const proposedStartTime = new Date(blockStartTime);
    const additionalMinutes =
      proposedPositionWithinBlock * presentationDurationMinutes;

    proposedStartTime.setMinutes(
      proposedStartTime.getMinutes() + additionalMinutes,
    );

    return proposedStartTime;
  }
}
