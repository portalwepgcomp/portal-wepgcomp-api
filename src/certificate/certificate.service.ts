import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppException } from '../exceptions/app.exception';
import { MailingService } from '../mailing/mailing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateGeneratorService } from './certificate-generator.service';

@Injectable()
export class CertificateService {
  constructor(
    private readonly prismaClient: PrismaService,
    private readonly mailingService: MailingService,
    private readonly eligibilityService: CertificateEligibilityService,
    private readonly generatorService: CertificateGeneratorService,
  ) {}

  async generateCertificateForUser(
    userId: string,
    eventEditionId: string,
  ): Promise<Buffer> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: { id: userId },
      include: {
        panelistParticipations: {
          where: {
            presentationBlock: {
              eventEditionId: eventEditionId,
            },
          },
        },
        mainAuthored: {
          where: {
            eventEditionId,
          },
        },
        panelistAwards: {
          where: {
            eventEditionId,
          },
        },
        certificates: {
          where: { eventEditionId },
        },
      },
    });
    if (!user) {
      throw new AppException('User not found', 404);
    }

    const eventEdition = await this.prismaClient.eventEdition.findUnique({
      where: { id: eventEditionId },
    });

    if (!eventEdition) {
      throw new AppException('Event edition not found', 404);
    }

    await this.validateUserEligibility(user, eventEdition);

    const userSubmission = user.mainAuthored?.[0];

    return this.generatorService.generateUserCertificate(
      user,
      eventEdition,
      userSubmission,
    );
  }

  /**
   * Calculates the award results for a user's presentation based on public and evaluator scores
   */
  public calculateAwardStandings(presentations: any[], userSubmission: any) {
    return this.eligibilityService.calculateAwardStandings(
      presentations,
      userSubmission,
    );
  }

  /**
   * Validates if a user is eligible to receive a certificate based on their profile and participation.
   */
  public async validateUserEligibility(
    user: any,
    eventEdition: any,
  ): Promise<void> {
    return this.eligibilityService.validateUserEligibility(user, eventEdition);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    const oneDayBefore = new Date();
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(0, 0, 0, 0);
    const oneDayBeforeAdjusted = new Date(
      oneDayBefore.getTime() - oneDayBefore.getTimezoneOffset() * 60000,
    );
    const nextDay = new Date(oneDayBeforeAdjusted);
    nextDay.setDate(nextDay.getDate() + 1);
    const events = await this.prismaClient.eventEdition.findMany({
      where: {
        isActive: true,
        endDate: {
          gte: oneDayBeforeAdjusted,
          lt: nextDay,
        },
      },
    });
    for (const event of events) {
      const users = await this.prismaClient.userAccount.findMany({
        include: {
          panelistParticipations: {
            where: {
              presentationBlock: {
                eventEditionId: event.id,
              },
            },
          },
          mainAuthored: {
            where: {
              eventEditionId: event.id,
            },
          },
          panelistAwards: {
            where: {
              eventEditionId: event.id,
            },
          },
          certificates: {
            where: { eventEditionId: event.id },
          },
        },
      });
      for (const user of users) {
        try {
          await this.validateUserEligibility(user, event);

          const text = `Seu certificado já está pronto para ser baixado na página do WEPGCOMP!`;
          const CertificateEmail = {
            from: process.env.SMTP_FROM_EMAIL || '',
            to: user.email,
            subject: 'Certificado',
            text,
          };
          this.mailingService.sendEmail(CertificateEmail);
        } catch {}
      }
    }
  }
}
