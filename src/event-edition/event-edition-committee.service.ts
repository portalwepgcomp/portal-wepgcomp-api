import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommitteeLevel, CommitteeRole, UserLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFromEventEditionFormDto } from './dto/create-event-edition.dto';

@Injectable()
export class EventEditionCommitteeService {
  private readonly logger = new Logger(EventEditionCommitteeService.name);

  constructor(private readonly prismaClient: PrismaService) {}

  async validateUniqueCommitteeMembers(
    createFromEventEditionFormDto: CreateFromEventEditionFormDto,
  ): Promise<void> {
    const {
      organizingCommitteeIds,
      itSupportIds,
      administrativeSupportIds,
      communicationIds,
    } = createFromEventEditionFormDto;

    const allIds = [
      ...(organizingCommitteeIds || []),
      ...(itSupportIds || []),
      ...(administrativeSupportIds || []),
      ...(communicationIds || []),
    ];

    const duplicates = allIds.filter(
      (id, index) => allIds.indexOf(id) !== index,
    );

    if (duplicates.length > 0) {
      throw new BadRequestException(
        'Um usuário só pode assumir um cargo na comissão organizadora.',
      );
    }
  }

  async createCommitteeMembersFromArray(
    eventEditionId: string,
    ids: Array<string>,
    role: CommitteeRole,
  ): Promise<void> {
    if (!ids?.length) return;

    await Promise.all(
      ids.map(async (id) => {
        const existingMember =
          await this.prismaClient.committeeMember.findUnique({
            where: {
              eventEditionId_userId: {
                eventEditionId,
                userId: id,
              },
            },
          });

        if (existingMember) {
          if (existingMember.level === CommitteeLevel.Coordinator) {
            return;
          }
          throw new BadRequestException(
            'Um usuário só pode assumir um cargo na comissão organizadora.',
          );
        }

        const committeeMember = await this.prismaClient.committeeMember.create({
          data: {
            eventEditionId,
            userId: id,
            level: CommitteeLevel.Committee,
            role,
          },
        });

        if (committeeMember) {
          await this.updateUserLevel(id, committeeMember.level);
        }
      }),
    );
  }

  async updateCommitteeMembersFromArray(
    eventEditionId: string,
    ids: Array<string>,
    role: CommitteeRole,
  ): Promise<void> {
    if (!ids || !ids.length) return;

    await Promise.all(
      ids.map(async (id) => {
        const committeeMember = await this.prismaClient.committeeMember.upsert({
          where: {
            eventEditionId_userId: {
              eventEditionId,
              userId: id,
            },
          },
          update: {
            role,
          },
          create: {
            eventEditionId,
            userId: id,
            level: CommitteeLevel.Committee,
            role,
          },
        });

        if (committeeMember) {
          await this.updateUserLevel(id, committeeMember.level);
        }
      }),
    );
  }

  async updateUserLevel(
    userId: string,
    committeeLevel: CommitteeLevel,
  ): Promise<void> {
    const userLevel =
      committeeLevel === CommitteeLevel.Coordinator
        ? UserLevel.Superadmin
        : UserLevel.Admin;

    await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        level: userLevel,
      },
    });
  }

  @Cron('0 0 * * *')
  async removeAdminsFromEndedEvents(): Promise<void> {
    const now = new Date();

    const endedEvents = await this.prismaClient.eventEdition.findMany({
      where: {
        endDate: {
          lte: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (endedEvents.length === 0) {
      this.logger.log('Nenhum evento finalizado encontrado.');
      return;
    }

    const eventIds = endedEvents.map((event) => event.id);

    const adminsToRemove = await this.prismaClient.committeeMember.findMany({
      where: {
        eventEditionId: { in: eventIds },
        level: CommitteeLevel.Committee,
      },
      select: {
        userId: true,
      },
    });

    if (adminsToRemove.length === 0) {
      this.logger.log('Nenhum administrador encontrado.');
      return;
    }

    const adminIds = adminsToRemove.map((admin) => admin.userId);

    await this.prismaClient.userAccount.updateMany({
      where: {
        id: { in: adminIds },
        level: { not: UserLevel.Superadmin },
      },
      data: {
        level: UserLevel.Default,
      },
    });

    this.logger.log(
      `${adminIds.length} usuários atualizados para nível Default.`,
    );
  }
}
