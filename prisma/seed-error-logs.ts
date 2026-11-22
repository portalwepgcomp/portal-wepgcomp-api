/**
 * Popula a tabela error_log com falhas fictícias dos últimos 30 dias, para
 * visualizar a tela de logs no ambiente local. Usa usuários reais do banco.
 *
 * Uso: npm run seed:error-logs
 * Reexecutar substitui apenas os registros gerados por este script.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_MARK = 'demo-error-logs';
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let state = 20261121;
function random(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) =>
  Math.floor(min + random() * (max - min + 1));

type Frame = [fn: string, file: string, line: number, column: number];

function stackOf(header: string, projectFrames: Frame[]): string {
  const library = header.startsWith('PrismaClient')
    ? [
        '    at Rn.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7315)',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
      ]
    : [];
  const project = projectFrames.map(
    ([fn, file, line, column]) =>
      `    at ${fn} (/app/${file}:${line}:${column})`,
  );
  const tail = [
    '    at /app/node_modules/@nestjs/core/router/router-execution-context.js:46:28',
    '    at /app/node_modules/@nestjs/core/router/router-proxy.js:9:17',
  ];
  return [header, ...library, ...project, ...tail].join('\n');
}

interface SeedUser {
  id: string;
  name: string;
  email: string;
  level: string;
  profile: string;
}

const RUNTIME = {
  nodeEnv: 'development',
  hostname: 'wepgcomp-api-local',
  pid: 4127,
  nodeVersion: 'v22.11.0',
  appVersion: '0.0.1',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
];

interface Scenario {
  weight: number;
  build: (ctx: {
    users: SeedUser[];
    at: Date;
  }) => Prisma.ErrorLogCreateManyInput[];
}

function requestContext(options: {
  user?: SeedUser;
  tokenStatus: 'valid' | 'expired' | 'missing' | 'invalid';
  query?: unknown;
  params?: unknown;
  body?: unknown;
}) {
  return {
    query: options.query ?? {},
    params: options.params ?? {},
    body: options.body ?? {},
    ip: `200.128.51.${between(10, 250)}`,
    userAgent: pick(USER_AGENTS),
    referer: 'https://wepgcomp.app.ic.ufba.br/',
    origin: 'https://wepgcomp.app.ic.ufba.br',
    hasAuthorization: options.tokenStatus !== 'missing',
    tokenStatus: options.tokenStatus,
  };
}

function userColumns(user: SeedUser | undefined, authenticated = true) {
  if (!user) {
    return { isAuthenticated: false };
  }
  return {
    isAuthenticated: authenticated,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userLevel: user.level,
    userProfile: user.profile,
  };
}

function base(at: Date, extra: Record<string, unknown>) {
  return { createdAt: at, requestId: randomUUID(), ...extra };
}

const scenarios: Scenario[] = [
  {
    weight: 26,
    build: ({ users, at }) => {
      const user = pick(users);
      const route = pick([
        '/users/me',
        '/submission/:id',
        '/presentation/bookmarks',
        '/certificate/user',
      ]);
      const path = route.replace(':id', randomUUID());
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'warn',
          statusCode: 401,
          method: 'GET',
          path,
          route,
          ...userColumns(user, false),
          exceptionName: 'UnauthorizedException',
          message: 'Unauthorized',
          loggerContext: 'HttpExceptionFilter',
          context: {
            [SEED_MARK]: true,
            responseBody: { message: 'Unauthorized', statusCode: 401 },
            request: requestContext({ user, tokenStatus: 'expired' }),
            durationMs: between(2, 9),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 18,
    build: ({ users, at }) => {
      const user = pick(users);
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'warn',
          statusCode: 400,
          method: 'POST',
          path: '/submission',
          route: '/submission',
          ...userColumns(user),
          exceptionName: 'BadRequestException',
          message: 'Dados inválidos.',
          loggerContext: 'HttpExceptionFilter',
          file: 'src/main.ts',
          line: 100,
          column: 16,
          functionName: 'ValidationPipe.exceptionFactory',
          context: {
            [SEED_MARK]: true,
            stack: stackOf('BadRequestException: Dados inválidos.', [
              ['ValidationPipe.exceptionFactory', 'src/main.ts', 100, 16],
            ]),
            responseBody: {
              error: 'VALIDATION_ERROR',
              message: 'Dados inválidos.',
              details: [
                { field: 'title', messages: ['title should not be empty'] },
                {
                  field: 'phoneNumber',
                  messages: ['phoneNumber must be a valid phone number'],
                },
              ],
            },
            request: requestContext({
              user,
              tokenStatus: 'valid',
              body: {
                title: '',
                abstract: 'Estudo sobre...',
                phoneNumber: '7199',
                advisorId: randomUUID(),
              },
            }),
            handler: { controller: 'SubmissionController', method: 'create' },
            durationMs: between(3, 12),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 14,
    build: ({ users, at }) => {
      const user = random() > 0.4 ? pick(users) : undefined;
      const id = randomUUID();
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'warn',
          statusCode: 404,
          method: 'GET',
          path: `/presentation/${id}`,
          route: '/presentation/:id',
          ...userColumns(user),
          exceptionName: 'AppException',
          message: 'Apresentação não encontrada',
          loggerContext: 'HttpExceptionFilter',
          file: 'src/presentation/presentation.service.ts',
          line: 188,
          column: 13,
          functionName: 'PresentationService.findOne',
          context: {
            [SEED_MARK]: true,
            stack: stackOf('AppException: Apresentação não encontrada', [
              [
                'PresentationService.findOne',
                'src/presentation/presentation.service.ts',
                188,
                13,
              ],
              [
                'PresentationController.findOne',
                'src/presentation/presentation.controller.ts',
                74,
                12,
              ],
            ]),
            responseBody: {
              message: 'Apresentação não encontrada',
              statusCode: 404,
            },
            request: requestContext({
              user,
              tokenStatus: user ? 'valid' : 'missing',
              params: { id },
            }),
            handler: {
              controller: 'PresentationController',
              method: 'findOne',
            },
            prismaOperations: [
              {
                model: 'Presentation',
                action: 'findUnique',
                args: { where: { id } },
                durationMs: between(2, 8),
                failed: false,
              },
            ],
            durationMs: between(6, 20),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 8,
    build: ({ users, at }) => {
      const user =
        pick(users.filter((u) => u.level === 'Default')) ?? pick(users);
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'warn',
          statusCode: 403,
          method: 'PATCH',
          path: '/event/registration-open',
          route: '/event/registration-open',
          ...userColumns(user),
          exceptionName: 'ForbiddenException',
          message: 'Acesso negado: permissões insuficientes',
          loggerContext: 'HttpExceptionFilter',
          file: 'src/auth/guards/user-level.guard.ts',
          line: 56,
          column: 13,
          functionName: 'UserLevelGuard.canActivate',
          context: {
            [SEED_MARK]: true,
            stack: stackOf(
              'ForbiddenException: Acesso negado: permissões insuficientes',
              [
                [
                  'UserLevelGuard.canActivate',
                  'src/auth/guards/user-level.guard.ts',
                  56,
                  13,
                ],
              ],
            ),
            responseBody: {
              message: 'Acesso negado: permissões insuficientes',
              error: 'Forbidden',
              statusCode: 403,
            },
            request: requestContext({
              user,
              tokenStatus: 'valid',
              body: { registrationOpen: true },
            }),
            prismaOperations: [
              {
                model: 'UserAccount',
                action: 'findUnique',
                args: {
                  where: { id: user.id },
                  select: { id: true, level: true, isActive: true },
                },
                durationMs: 3,
                failed: false,
              },
            ],
            durationMs: between(4, 10),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 6,
    build: ({ at }) => {
      const email = pick([
        'joana.lima@ufba.br',
        'carlos.souza@ufba.br',
        'marina.alves@ufba.br',
      ]);
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'error',
          statusCode: 500,
          method: 'POST',
          path: '/users/register',
          route: '/users/register',
          isAuthenticated: false,
          exceptionName: 'PrismaClientKnownRequestError',
          message:
            '\nInvalid `this.prismaClient.userAccount.create()` invocation in\n/app/src/user/user.service.ts:118:52\n\nUnique constraint failed on the fields: (`registration_number`)',
          loggerContext: 'HttpExceptionFilter',
          prismaCode: 'P2002',
          file: 'src/user/user.service.ts',
          line: 118,
          column: 52,
          functionName: 'UserService.create',
          context: {
            [SEED_MARK]: true,
            stack: stackOf(
              'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`registration_number`)',
              [
                ['UserService.create', 'src/user/user.service.ts', 118, 52],
                [
                  'UserController.create',
                  'src/user/user.controller.ts',
                  48,
                  12,
                ],
              ],
            ),
            responseBody: { message: 'Erro interno no servidor' },
            request: requestContext({
              tokenStatus: 'missing',
              body: {
                name: 'Joana Lima',
                email,
                password: '[REDACTED]',
                registrationNumber: '219116032',
                profile: 'Presenter',
              },
            }),
            handler: { controller: 'UserController', method: 'create' },
            prisma: {
              type: 'KnownRequestError',
              code: 'P2002',
              meta: {
                modelName: 'UserAccount',
                target: ['registration_number'],
              },
              clientVersion: '5.22.0',
            },
            prismaOperations: [
              {
                model: 'UserAccount',
                action: 'findUnique',
                args: { where: { email } },
                durationMs: 4,
                failed: false,
              },
              {
                model: 'UserAccount',
                action: 'create',
                args: {
                  data: {
                    name: 'Joana Lima',
                    email,
                    password: '[REDACTED]',
                    registrationNumber: '219116032',
                  },
                },
                durationMs: 11,
                failed: true,
              },
            ],
            durationMs: between(90, 160),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 5,
    build: ({ users, at }) => {
      const user = pick(users);
      const id = randomUUID();
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'error',
          statusCode: 500,
          method: 'PATCH',
          path: `/submission/${id}`,
          route: '/submission/:id',
          ...userColumns(user),
          exceptionName: 'PrismaClientKnownRequestError',
          message:
            '\nInvalid `prisma.submission.update()` invocation:\n\nAn operation failed because it depends on one or more records that were required but not found. Record to update not found.',
          loggerContext: 'HttpExceptionFilter',
          prismaCode: 'P2025',
          file: 'src/submission/submission.service.ts',
          line: 284,
          column: 41,
          functionName: 'SubmissionService.update',
          context: {
            [SEED_MARK]: true,
            stack: stackOf(
              'PrismaClientKnownRequestError: Record to update not found.',
              [
                [
                  'SubmissionService.update',
                  'src/submission/submission.service.ts',
                  284,
                  41,
                ],
                [
                  'SubmissionController.update',
                  'src/submission/submission.controller.ts',
                  121,
                  12,
                ],
              ],
            ),
            responseBody: { message: 'Erro interno no servidor' },
            request: requestContext({
              user,
              tokenStatus: 'valid',
              params: { id },
              body: { title: 'Aprendizado federado em redes veiculares' },
            }),
            handler: { controller: 'SubmissionController', method: 'update' },
            prisma: {
              type: 'KnownRequestError',
              code: 'P2025',
              meta: {
                modelName: 'Submission',
                cause: 'Record to update not found.',
              },
              clientVersion: '5.22.0',
            },
            prismaOperations: [
              {
                model: 'Submission',
                action: 'update',
                args: {
                  where: { id },
                  data: { title: 'Aprendizado federado em redes veiculares' },
                },
                durationMs: 7,
                failed: true,
              },
            ],
            durationMs: between(15, 40),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 6,
    build: ({ users, at }) => {
      const user = pick(users);
      const editionId = randomUUID();
      return [
        {
          ...base(at, {}),
          source: 'http',
          level: 'error',
          statusCode: 500,
          method: 'GET',
          path: `/certificate/event-edition/${editionId}`,
          route: '/certificate/event-edition/:eventEditionId',
          ...userColumns(user),
          exceptionName: 'TypeError',
          message: "Cannot read properties of undefined (reading 'name')",
          loggerContext: 'HttpExceptionFilter',
          file: 'src/certificate/certificate-generator.service.ts',
          line: 97,
          column: 38,
          functionName: 'CertificateGeneratorService.buildText',
          context: {
            [SEED_MARK]: true,
            stack: stackOf(
              "TypeError: Cannot read properties of undefined (reading 'name')",
              [
                [
                  'CertificateGeneratorService.buildText',
                  'src/certificate/certificate-generator.service.ts',
                  97,
                  38,
                ],
                [
                  'CertificateGeneratorService.generate',
                  'src/certificate/certificate-generator.service.ts',
                  41,
                  25,
                ],
                [
                  'CertificateService.generateForUser',
                  'src/certificate/certificate.service.ts',
                  152,
                  18,
                ],
              ],
            ),
            responseBody: { message: 'Erro interno no servidor' },
            request: requestContext({
              user,
              tokenStatus: 'valid',
              params: { eventEditionId: editionId },
            }),
            handler: {
              controller: 'CertificateController',
              method: 'downloadForEdition',
            },
            prismaOperations: [
              {
                model: 'EventEdition',
                action: 'findUnique',
                args: { where: { id: editionId } },
                durationMs: 5,
                failed: false,
              },
              {
                model: 'Certificate',
                action: 'findFirst',
                args: { where: { userId: user.id, eventEditionId: editionId } },
                durationMs: 4,
                failed: false,
              },
            ],
            durationMs: between(120, 380),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 7,
    build: ({ users, at }) => {
      const user = pick(users);
      const requestId = randomUUID();
      const smtpStack = [
        'Error: connect ECONNREFUSED 10.0.4.12:587',
        '    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1615:16)',
        '    at async MailingService.sendEmail (/app/src/mailing/mailing.service.ts:58:7)',
        '    at async MailingService.contact (/app/src/mailing/mailing.service.ts:83:7)',
      ].join('\n');
      const request = requestContext({
        user,
        tokenStatus: 'valid',
        body: {
          name: user.name,
          email: user.email,
          text: 'Não consigo anexar o PDF da apresentação.',
        },
      });
      return [
        {
          createdAt: at,
          requestId,
          source: 'logger',
          level: 'error',
          method: 'POST',
          path: '/mailing/contact',
          route: '/mailing/contact',
          ...userColumns(user),
          exceptionName: 'Error',
          message: 'Falha ao enviar email de contato',
          loggerContext: 'MailingService',
          file: 'src/mailing/mailing.service.ts',
          line: 58,
          column: 7,
          functionName: 'MailingService.sendEmail',
          context: {
            [SEED_MARK]: true,
            stack: smtpStack,
            request,
            handler: { controller: 'MailingController', method: 'contact' },
            prismaOperations: [
              {
                model: 'EventEdition',
                action: 'findFirst',
                args: { where: { isActive: true } },
                durationMs: 3,
                failed: false,
              },
              {
                model: 'CommitteeMember',
                action: 'findFirst',
                args: { where: { level: 'Coordinator' } },
                durationMs: 4,
                failed: false,
              },
            ],
            extra: {
              originalError: 'Error: connect ECONNREFUSED 10.0.4.12:587',
            },
            durationMs: 3012,
            runtime: RUNTIME,
          },
        },
        {
          createdAt: new Date(at.getTime() + 4),
          requestId,
          source: 'http',
          level: 'error',
          statusCode: 500,
          method: 'POST',
          path: '/mailing/contact',
          route: '/mailing/contact',
          ...userColumns(user),
          exceptionName: 'AppException',
          message: 'Erro no envio de email.',
          loggerContext: 'HttpExceptionFilter',
          file: 'src/mailing/mailing.service.ts',
          line: 90,
          column: 13,
          functionName: 'MailingService.contact',
          context: {
            [SEED_MARK]: true,
            stack: stackOf('AppException: Erro no envio de email.', [
              [
                'MailingService.contact',
                'src/mailing/mailing.service.ts',
                90,
                13,
              ],
              [
                'MailingController.contact',
                'src/mailing/mailing.controller.ts',
                31,
                12,
              ],
            ]),
            responseBody: {
              message: 'Erro no envio de email.',
              statusCode: 500,
            },
            request,
            handler: { controller: 'MailingController', method: 'contact' },
            durationMs: 3016,
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
  {
    weight: 3,
    build: ({ at }) => {
      const midnight = new Date(at);
      midnight.setUTCHours(3, 0, between(0, 2), between(0, 999));
      return [
        {
          createdAt: midnight,
          source: 'cron',
          level: 'error',
          isAuthenticated: false,
          exceptionName: 'Error',
          message:
            'Falha ao gerar certificados: fonte Montserrat-Bold.ttf não encontrada',
          loggerContext: 'Scheduler',
          file: 'src/certificate/certificate-assets.service.ts',
          line: 34,
          column: 15,
          functionName: 'CertificateAssetsService.loadFont',
          context: {
            [SEED_MARK]: true,
            stack: [
              'Error: Falha ao gerar certificados: fonte Montserrat-Bold.ttf não encontrada',
              '    at CertificateAssetsService.loadFont (/app/src/certificate/certificate-assets.service.ts:34:15)',
              '    at CertificateService.handleCron (/app/src/certificate/certificate.service.ts:96:22)',
              '    at /app/node_modules/@nestjs/schedule/dist/schedule.explorer.js:124:38',
            ].join('\n'),
            runtime: RUNTIME,
          },
        },
      ];
    },
  },
];

function spikeScenario(
  at: Date,
  users: SeedUser[],
): Prisma.ErrorLogCreateManyInput {
  const route = pick([
    '/presentation',
    '/submission',
    '/event/active',
    '/users/me',
    '/presentation-block',
  ]);
  const user = random() > 0.3 ? pick(users) : undefined;
  return {
    ...base(at, {}),
    source: 'http',
    level: 'error',
    statusCode: 500,
    method: 'GET',
    path: route,
    route,
    ...userColumns(user),
    exceptionName: 'PrismaClientInitializationError',
    message:
      "Can't reach database server at `postgres:5432`\n\nPlease make sure your database server is running at `postgres:5432`.",
    loggerContext: 'HttpExceptionFilter',
    prismaCode: 'P1001',
    file: 'src/presentation/presentation.service.ts',
    line: 64,
    column: 25,
    functionName: 'PresentationService.findAll',
    context: {
      [SEED_MARK]: true,
      stack: stackOf(
        "PrismaClientInitializationError: Can't reach database server at `postgres:5432`",
        [
          [
            'PresentationService.findAll',
            'src/presentation/presentation.service.ts',
            64,
            25,
          ],
        ],
      ),
      responseBody: { message: 'Erro interno no servidor' },
      request: requestContext({
        user,
        tokenStatus: user ? 'valid' : 'missing',
      }),
      prisma: {
        type: 'InitializationError',
        code: 'P1001',
        clientVersion: '5.22.0',
      },
      prismaOperations: [
        {
          model: 'Presentation',
          action: 'findMany',
          args: { where: { submission: { eventEditionId: randomUUID() } } },
          durationMs: 10003,
          failed: true,
        },
      ],
      durationMs: 10011,
      runtime: RUNTIME,
    },
  };
}

function processFailure(at: Date): Prisma.ErrorLogCreateManyInput {
  return {
    createdAt: at,
    source: 'process',
    level: 'error',
    isAuthenticated: false,
    exceptionName: 'Error',
    message: 'socket hang up',
    loggerContext: 'unhandledRejection',
    context: {
      [SEED_MARK]: true,
      stack: [
        'Error: socket hang up',
        '    at TLSSocket.socketOnEnd (node:_http_client:524:23)',
        '    at TLSSocket.emit (node:events:530:35)',
        '    at endReadableNT (node:internal/streams/readable:1698:12)',
      ].join('\n'),
      runtime: RUNTIME,
    },
  };
}

function randomMomentOfDay(dayStart: number): Date {
  // Mais falhas em horário comercial (UTC-3): 11h–23h UTC.
  const hour = random() < 0.8 ? between(11, 23) : between(0, 10);
  return new Date(dayStart + hour * 3600000 + between(0, 3599999));
}

async function main() {
  const users: SeedUser[] = await prisma.userAccount.findMany({
    select: { id: true, name: true, email: true, level: true, profile: true },
    take: 40,
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    throw new Error('Nenhum usuário no banco. Rode `npm run seed` antes.');
  }

  const removed = await prisma.errorLog.deleteMany({
    where: { context: { path: [SEED_MARK], equals: true } },
  });

  const now = Date.now();
  const todayStart = now - (now % DAY_MS);
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const rows: Prisma.ErrorLogCreateManyInput[] = [];

  for (let day = DAYS - 1; day >= 0; day--) {
    const dayStart = todayStart - day * DAY_MS;
    const growth = 1 + (DAYS - day) / DAYS;
    const count = Math.round(between(6, 14) * growth);

    for (let i = 0; i < count; i++) {
      const at = randomMomentOfDay(dayStart);
      if (at.getTime() > now) continue;
      let roll = random() * totalWeight;
      const scenario =
        scenarios.find((s) => (roll -= s.weight) < 0) ?? scenarios[0];
      rows.push(...scenario.build({ users, at }));
    }

    if (day === 4) {
      const outageStart = dayStart + 17 * 3600000 + 12 * 60000;
      for (let i = 0; i < 46; i++) {
        rows.push(
          spikeScenario(new Date(outageStart + between(0, 9 * 60000)), users),
        );
      }
    }

    if (day === 9 || day === 1) {
      rows.push(processFailure(randomMomentOfDay(dayStart)));
    }
  }

  const recent = rows.filter((row) => (row.createdAt as Date).getTime() <= now);
  for (let i = 0; i < recent.length; i += 200) {
    await prisma.errorLog.createMany({ data: recent.slice(i, i + 200) });
  }

  console.log(
    `error_log: ${removed.count} registro(s) de demonstração removido(s), ${recent.length} criado(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
