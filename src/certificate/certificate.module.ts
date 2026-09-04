import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CertificateController } from './certificate.controller';
import { CertificateAssetsService } from './certificate-assets.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateGeneratorService } from './certificate-generator.service';
import { MailingModule } from '../mailing/mailing.module';

@Module({
  controllers: [CertificateController],
  providers: [
    CertificateService,
    CertificateAssetsService,
    CertificateEligibilityService,
    CertificateGeneratorService,
  ],
  imports: [MailingModule],
  exports: [
    CertificateService,
    CertificateAssetsService,
    CertificateEligibilityService,
    CertificateGeneratorService,
  ],
})
export class CertificateModule {}
