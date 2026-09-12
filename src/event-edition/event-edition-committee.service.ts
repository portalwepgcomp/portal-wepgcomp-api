import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
    _committeeLevel: CommitteeLevel,
  ): Promise<void> {
    // Coordinator e Committee promovem o usuário para Admin igualmente —
    // não há mais diferenciação de nível (Superadmin foi eliminado).
    await this.prismaClient.userAccount.update({
      where: { id: userId },
      data: {
        level: UserLevel.Admin,
      },
    });
  }

  /**
   * TODO(unify-superadmin-into-admin): reintroduzir de forma segura após a
   * unificação de permissões. Antes, este cron preservava usuários
   * `Superadmin` ao rebaixar administradores de comitês de eventos
   * encerrados. Sem essa distinção, rebaixar automaticamente poderia afetar
   * Admins que não pertencem ao comitê do evento encerrado (ou que ainda
   * são Coordinator/Committee em outro evento ativo). Desativado por ora —
   * ver issue de unificação Superadmin -> Admin.
   */
  // @Cron('0 0 * * *')
  async removeAdminsFromEndedEvents(): Promise<void> {
    this.logger.log(
      'removeAdminsFromEndedEvents está desativado (ver TODO de unificação Superadmin -> Admin).',
    );
  }
}
