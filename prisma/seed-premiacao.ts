import {
  PanelistStatus,
  PresentationBlockType,
  PresentationStatus,
  PrismaClient,
  Profile,
  SubmissionStatus,
} from '@prisma/client';
import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { v5 as uuid } from 'uuid';

/** Adiciona um exemplo de recálculo sem limpar dados ou sobrescrever avaliações. */
export async function seedPremiacao(
  prisma: PrismaClient,
  eventEditionId?: string,
) {
  const edition = eventEditionId
    ? await prisma.eventEdition.findUnique({ where: { id: eventEditionId } })
    : await prisma.eventEdition.findFirst({
        where: { isActive: true },
        orderBy: { startDate: 'desc' },
      });

  if (!edition) throw new Error('Selecione uma edição existente para o seed.');

  const id = (key: string) =>
    uuid(`seed-premiacao:${edition.id}:${key}`, uuid.URL);
  const password = await hash(
    process.env.SEED_PASSWORD || randomBytes(24).toString('base64url'),
    10,
  );

  const presentation = await prisma.$transaction(async (tx) => {
    const users = [];
    for (const [key, name, profile] of [
      ['autor', 'Apresentadora de Teste', Profile.Presenter],
      ['orientador', 'Orientador de Teste', Profile.Professor],
      ['banca', 'Avaliadora de Teste', Profile.Professor],
    ] as const) {
      users.push(
        await tx.userAccount.upsert({
          where: { email: `${key}.premiacao@wepgcomp.local` },
          update: {},
          create: {
            name,
            email: `${key}.premiacao@wepgcomp.local`,
            password,
            profile,
            isVerified: true,
            isPresenterActive: profile === Profile.Presenter,
            isTeacherActive: profile === Profile.Professor,
          },
        }),
      );
    }
    const [author, advisor, panelist] = users;

    const block = await tx.presentationBlock.upsert({
      where: { id: id('sessao') },
      update: {},
      create: {
        id: id('sessao'),
        eventEditionId: edition.id,
        type: PresentationBlockType.Presentation,
        title: 'Sessão de teste da premiação',
        startTime: edition.startDate,
        duration: 20,
      },
    });
    await tx.panelist.upsert({
      where: { id: id('banca') },
      update: {},
      create: {
        id: id('banca'),
        presentationBlockId: block.id,
        userId: panelist.id,
        status: PanelistStatus.Present,
      },
    });

    const submission = await tx.submission.upsert({
      where: { id: id('submissao') },
      update: {},
      create: {
        id: id('submissao'),
        eventEditionId: edition.id,
        mainAuthorId: author.id,
        advisorId: advisor.id,
        title: 'Apresentação de teste — Recálculo da premiação',
        abstract: 'Dados fictícios para validar a atualização dos rankings.',
        pdfFile: 'path/to/default.pdf',
        phoneNumber: '(71) 99999-9999',
        status: SubmissionStatus.Confirmed,
      },
    });

    let criteria = await tx.evaluationCriteria.findMany({
      where: { eventEditionId: edition.id },
    });
    if (criteria.length === 0) {
      criteria = [
        await tx.evaluationCriteria.create({
          data: {
            id: id('criterio'),
            eventEditionId: edition.id,
            title: 'Qualidade da apresentação',
            description: 'Critério de teste da premiação.',
            weightRadio: 1,
          },
        }),
      ];
    }
    await tx.evaluation.createMany({
      data: criteria.flatMap((criterion) => [
        {
          id: id(`avaliacao-banca:${criterion.id}`),
          submissionId: submission.id,
          evaluationCriteriaId: criterion.id,
          userId: panelist.id,
          score: 3,
        },
        {
          id: id(`avaliacao-publico:${criterion.id}`),
          submissionId: submission.id,
          evaluationCriteriaId: criterion.id,
          name: 'Público de Teste',
          email: 'publico.premiacao@wepgcomp.local',
          score: 3,
        },
      ]),
      skipDuplicates: true,
    });

    return tx.presentation.upsert({
      where: { id: id('apresentacao') },
      update: {},
      create: {
        id: id('apresentacao'),
        submissionId: submission.id,
        presentationBlockId: block.id,
        positionWithinBlock: 0,
        status: PresentationStatus.Presented,
        // Simula notas antigas: o recálculo deve refletir as avaliações de 3.
        publicAverageScore: 4,
        evaluatorsAverageScore: 4,
      },
    });
  });

  console.log(`Apresentação de teste disponível em ${edition.name}.`);
  return presentation;
}
