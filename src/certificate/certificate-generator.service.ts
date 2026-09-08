import { Injectable } from '@nestjs/common';
import { Profile } from '@prisma/client';
import * as fontkit from '@pdf-lib/fontkit';
import { PageSizes, PDFDocument, PDFFont, rgb, TextAlignment } from 'pdf-lib';
import { CertificateAssetsService } from './certificate-assets.service';

@Injectable()
export class CertificateGeneratorService {
  constructor(private readonly assetsService: CertificateAssetsService) {}

  async generateUserCertificate(
    user: any,
    eventEdition: any,
    userSubmission?: any,
  ): Promise<Buffer> {
    const fonts: Record<string, null | PDFFont> = {
      bold: null,
      regular: null,
      semibold: null,
      italic: null,
      medium: null,
      bolditalic: null,
    };

    const { pdfDoc, page } = await this.buildBaseCertificate(
      fonts,
      user.profile,
      eventEdition.id,
      eventEdition.name,
    );

    let texto = '';

    if (user.profile === Profile.Professor) {
      texto += `   Certificamos que ${user.name} participou como avaliador(a) em sessões de apresentações no Workshop de Estudantes do PGCOMP (${eventEdition.name}), promovido pelo Programa de Pós-Graduação em Ciência da Computação - Universidade Federal da Bahia, de ${this.dateHandler(eventEdition.startDate, eventEdition.endDate)}.`;
    } else if (user.profile === Profile.Listener) {
      texto += `   Certificamos que ${user.name} participou como ouvinte no Workshop de Estudantes do PGCOMP (${eventEdition.name}), promovido pelo Programa de Pós-Graduação em Ciência da Computação - Universidade Federal da Bahia, de ${this.dateHandler(eventEdition.startDate, eventEdition.endDate)}, com carga horária total de 10 horas.`;
    } else {
      texto += `    Certificamos que ${user.name} apresentou o trabalho "${userSubmission?.title}" na categoria Apresentação Oral no Workshop de Estudantes do PGCOMP (${eventEdition.name}), promovido pelo Programa de Pós-Graduação em Ciência da Computação - Universidade Federal da Bahia, de ${this.dateHandler(eventEdition.startDate, eventEdition.endDate)}.`;
    }

    const regularFont = await this.getFontAndEmbed(fonts, 'regular', pdfDoc);
    page.drawText(texto, {
      x: 50,
      y: 330,
      size: 16,
      font: regularFont,
      maxWidth: page.getWidth() - 90,
      lineHeight: 19,
    });

    const endDate = new Date(eventEdition.endDate);
    const placeAndTime = `Salvador, Bahia, ${endDate.getDate()} de ${new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(endDate)} de ${endDate.getFullYear()}.`;
    const placeAndTimeWidth = regularFont.widthOfTextAtSize(placeAndTime, 16);

    page.drawText(placeAndTime, {
      x: page.getWidth() - placeAndTimeWidth - 50,
      y: 185,
      size: 16,
      font: regularFont,
    });

    return Buffer.from(await pdfDoc.save());
  }

  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private dateHandler(
    startDate: string | Date,
    endDate: string | Date,
  ): string {
    const start =
      typeof startDate === 'string'
        ? this.parseLocalDate(startDate)
        : new Date(startDate);
    const end =
      typeof endDate === 'string'
        ? this.parseLocalDate(endDate)
        : new Date(endDate);

    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
      end,
    );
    const year = end.getFullYear();

    if (year === 2025) {
      return `${startDay} a ${endDay - 1} de ${month} de ${year}`;
    }
    return `${startDay} a ${endDay} de ${month} de ${year}`;
  }

  private async getFontAndEmbed(
    embeddedFonts: Record<string, null | PDFFont>,
    fontType: string,
    pdfDoc: PDFDocument,
  ): Promise<PDFFont> {
    if (embeddedFonts[fontType] == null) {
      const fontBytes = this.assetsService.getFontBuffer(fontType);
      embeddedFonts[fontType] = await pdfDoc.embedFont(fontBytes);
    }
    return embeddedFonts[fontType] as PDFFont;
  }

  private async buildBaseCertificate(
    fonts: Record<string, null | PDFFont>,
    userProfileType: string,
    eventEditionId: string,
    eventEditionName: string,
  ): Promise<{ pdfDoc: PDFDocument; page: any }> {
    const pdfDoc = await PDFDocument.create();

    pdfDoc.registerFontkit(fontkit);
    this.setPdfMetadata(pdfDoc, userProfileType, eventEditionName);
    const page = pdfDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
    await this.renderCertificateHeader(fonts, pdfDoc, page, userProfileType);
    await this.drawSignatures(page, fonts, pdfDoc, eventEditionId);
    return { pdfDoc, page };
  }

  private async renderCertificateHeader(
    fonts: Record<string, null | PDFFont>,
    pdfDoc: PDFDocument,
    page: any,
    userProfileType: string,
  ): Promise<void> {
    const lines = ['Universidade Federal da Bahia', 'Instituto de Computação'];
    const font = await this.getFontAndEmbed(fonts, 'medium', pdfDoc);
    const textSize = 26;
    const lineHeight = textSize * 1.25;

    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, textSize);
      page.drawText(line, {
        x: page.getWidth() / 2 - textWidth / 2,
        y: page.getHeight() - (textSize + lineHeight * index) - 60,
        size: textSize,
        font: font,
      });
    });

    const thirdSmallerLine =
      'Programa de Pós-Graduação em Ciência da Computação';
    const thirdSmallerLineWidth = font.widthOfTextAtSize(
      thirdSmallerLine,
      textSize / 1.4,
    );

    page.drawText(thirdSmallerLine, {
      x: page.getWidth() / 2 - thirdSmallerLineWidth / 2,
      y: page.getHeight() - (textSize + lineHeight * 1.9) - 60,
      size: textSize / 1.4,
      font: font,
    });

    const fontTitle = await this.getFontAndEmbed(fonts, 'semibold', pdfDoc);
    const title =
      userProfileType === Profile.Professor
        ? 'CERTIFICADO DE AVALIADOR'
        : userProfileType === Profile.Presenter
          ? 'CERTIFICADO DE APRESENTAÇÃO'
          : 'CERTIFICADO DE PARTICIPAÇÃO';

    const titleWidth = font.widthOfTextAtSize(title, textSize);

    page.drawText(title, {
      x: page.getWidth() / 2 - titleWidth / 2,
      y: page.getHeight() - 230,
      size: textSize,
      font: fontTitle,
    });

    const pgcompImageBytes = this.assetsService.getImageBuffer(
      'pgcomp_ufba_logo.png',
    );
    const ufbaImageBytes = this.assetsService.getImageBuffer(
      'brasao-ufba-low-res.png',
    );

    const pgcompImage = await pdfDoc.embedPng(pgcompImageBytes);
    const ufbaImage = await pdfDoc.embedPng(ufbaImageBytes);

    const pgcompDims = pgcompImage.scale(90 / pgcompImage.width);
    const ufbaDims = ufbaImage.scale(300 / ufbaImage.width);
    const ufbaLowResDims = ufbaImage.scale(95 / ufbaImage.width);

    page.drawImage(pgcompImage, {
      x: page.getWidth() - ufbaLowResDims.width - 50,
      y: page.getHeight() - ufbaLowResDims.height - 40,
      width: 90,
      height: pgcompDims.height,
    });

    page.drawImage(ufbaImage, {
      x: page.getWidth() / 2 - ufbaDims.width / 2,
      y: page.getHeight() / 2 - ufbaDims.height / 2,
      width: 300,
      height: ufbaDims.height,
      opacity: 0.16,
    });

    page.drawImage(ufbaImage, {
      x: 50,
      y: page.getHeight() - pgcompDims.height - 40,
      width: 95,
      height: ufbaLowResDims.height,
    });
  }

  private setPdfMetadata(
    pdfDoc: PDFDocument,
    userProfileType: string,
    eventEditionName: string,
  ): void {
    pdfDoc.setTitle(`Certificado de ${userProfileType} - ${eventEditionName}`);
    pdfDoc.setSubject(
      'Certificado de participação no ' + eventEditionName + '.',
    );
    pdfDoc.setProducer('Portal WEPGCOMP');
    pdfDoc.setCreator('Portal WEPGCOMP');
    pdfDoc.setAuthor(
      'Programa de Pós-Graduação em Ciência da Computação do IC-UFBA',
    );
  }

  private async drawSignatures(
    page: any,
    fonts: Record<string, null | PDFFont>,
    pdfDoc: PDFDocument,
    _eventEditionId: string,
  ): Promise<void> {
    const signatureLineSize = page.getWidth() / 6;
    page.drawLine({
      start: { x: page.getWidth() / 2 - signatureLineSize / 2, y: 115 },
      end: { x: page.getWidth() / 2 + signatureLineSize / 2, y: 115 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: signatureLineSize / 2, y: 115 },
      end: { x: signatureLineSize * 1.5, y: 115 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: page.getWidth() - signatureLineSize * 1.5, y: 115 },
      end: { x: page.getWidth() - signatureLineSize / 2, y: 115 },
    });

    const fredericoAraujoDuraoSignatureBytes =
      this.assetsService.getImageBuffer('frederico-araujo-durao-signature');
    const fredericoAraujoDuraoSignatureImage = await pdfDoc.embedPng(
      fredericoAraujoDuraoSignatureBytes,
    );
    const fredericoAraujoDuraoSignatureDims =
      fredericoAraujoDuraoSignatureImage.scale(
        180 / fredericoAraujoDuraoSignatureImage.width,
      );

    const mockSignatureImageBytes =
      this.assetsService.getImageBuffer('mock-signature.png');
    const mockSignatureImage = await pdfDoc.embedPng(mockSignatureImageBytes);
    const mockSignatureDims = mockSignatureImage.scale(
      135 / mockSignatureImage.width,
    );

    const font = await this.getFontAndEmbed(fonts, 'regular', pdfDoc);
    const fontSize = 12;

    // Left signature
    page.drawImage(fredericoAraujoDuraoSignatureImage, {
      x: signatureLineSize - fredericoAraujoDuraoSignatureDims.width / 2,
      y: 100,
      width: 180,
      height: fredericoAraujoDuraoSignatureDims.height,
    });
    const leftName = 'Frederico Araújo Durão';
    const leftRole = 'Coordenador(a) do PGCOMP';
    page.drawText(leftName, {
      x: signatureLineSize - font.widthOfTextAtSize(leftName, fontSize) / 2,
      y: 95,
      size: fontSize,
      font,
    });
    page.drawText(leftRole, {
      x: signatureLineSize - 150 / 2,
      y: 80,
      size: fontSize,
      font,
      lineHeight: fontSize * 1.2,
      align: TextAlignment.Center,
    });

    // Center signature
    page.drawImage(mockSignatureImage, {
      x: page.getWidth() / 2 - mockSignatureDims.width / 2,
      y: 120,
      width: 135,
      height: mockSignatureDims.height,
    });
    const centerName = 'Ivan do Carmo Machado';
    const centerRole = 'Diretor(a) do Instituto de Computação';
    page.drawText(centerName, {
      x: page.getWidth() / 2 - font.widthOfTextAtSize(centerName, fontSize) / 2,
      y: 95,
      size: fontSize,
      font,
    });
    page.drawText(centerRole, {
      x: page.getWidth() / 2 - font.widthOfTextAtSize(centerRole, fontSize) / 2,
      y: 80,
      size: fontSize,
      font,
    });

    // Right signature
    page.drawImage(fredericoAraujoDuraoSignatureImage, {
      x:
        page.getWidth() -
        signatureLineSize -
        fredericoAraujoDuraoSignatureDims.width / 2,
      y: 100,
      width: 180,
      height: fredericoAraujoDuraoSignatureDims.height,
    });

    const rightName = 'Frederico Araújo Durão';
    const rightRole = 'Coordenador(a) do WEPGCOMP';
    page.drawText(rightName, {
      x:
        page.getWidth() -
        signatureLineSize -
        font.widthOfTextAtSize(rightName, fontSize) / 2,
      y: 95,
      size: fontSize,
      font,
    });
    page.drawText(rightRole, {
      x:
        page.getWidth() -
        signatureLineSize -
        font.widthOfTextAtSize(rightRole, fontSize) / 2,
      y: 80,
      size: fontSize,
      font,
    });
  }
}
