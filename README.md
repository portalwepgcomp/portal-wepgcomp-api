# Portal WEPGCOMP — API

API do portal do **WEPGCOMP** (Workshop de Pós-Graduação em Computação / PGCOMP-UFBA). Consumida pelo frontend [`portal-wepgcomp-frontend`](https://github.com/portalwepgcomp/portal-wepgcomp-frontend).

## Sobre

Backend REST para usuários, autenticação JWT, submissões, apresentações, blocos/sessões, avaliações, pontuação, certificados, e-mails e uploads do evento.

## Stack

- **NestJS** 11 + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Passport/JWT**, **Swagger**, **Nodemailer**, **pdf-lib**
- **Jest** (unitário / e2e)
- Node **≥ 20.11** e npm **≥ 10** (`engines` no `package.json`; CI usa Node 20)
- Docker (Postgres local via `docker compose`)

## Estrutura do projeto

```text
portal-wepgcomp-api/
├── prisma/
│   ├── schema.prisma       # Schema do banco
│   ├── seed.ts             # Seed local
│   └── migrations/         # Histórico Prisma
├── src/
│   ├── main.ts             # Bootstrap (Helmet, CORS, ValidationPipe, Swagger)
│   ├── app.module.ts
│   ├── auth/               # Login, JWT, strategies, guards
│   ├── user/ · submission/ · presentation/
│   ├── presentation-block/ · event-edition/ · room/
│   ├── evaluation/ · evaluation-criteria/ · scoring/
│   ├── awarded-panelists/ · awarded-presenters/
│   ├── certificate/ · mailing/ · uploads/
│   ├── committee-member/ · guidance/
│   ├── prisma/             # PrismaService
│   ├── shared/             # ListQuery, paginação, permissions
│   ├── exceptions/ · config/ · interceptors/ · utils/
│   └── scripts/            # Scripts auxiliares (ex.: export Swagger)
├── test/                   # Testes e2e
├── storage/                # Uploads locais (não versionar conteúdo sensível)
├── .env.example
├── docker-compose.yml      # Postgres
├── Makefile
└── package.json
```

## Pré-requisitos

- Node.js ≥ 20.11 e npm ≥ 10
- Docker (para Postgres local via `make setup` / `make infra`)

## Instalação / Como rodar

```bash
# 1. Ambiente e dependências (sobe Postgres, npm install, prisma db push)
cp .env.example .env
# Ajuste DATABASE_URL, JWT_SECRET, SMTP_*, SEED_PASSWORD, etc.

make setup
# Equivalente manual:
#   docker compose up -d
#   npm install
#   npm run prisma:migrate   # executa `prisma db push`

# 2. Seed (opcional; limpa e recria dados de exemplo)
# Defina SEED_PASSWORD no .env ou no shell
npm run seed
# ou: make seed

# 3. Desenvolvimento (watch)
npm run start:dev
# ou: make dev
```

API em [http://localhost:3001](http://localhost:3001) (porta via `PORT` no `.env`). Swagger em `/docs` (configurado em `main.ts`).

### Seed

O seed **sempre limpa** os dados existentes antes de recriar o dataset de exemplo. Defina `SEED_PASSWORD` no `.env` (ou no ambiente). Se não houver valor, o script pode cair em senhas padrão de desenvolvimento — use apenas em ambiente local.

```bash
npm run seed
# ou: make seed
```

## Variáveis de ambiente

Consulte [`.env.example`](.env.example). Principais:

| Variável | Descrição |
|---|---|
| `PORT` | Porta HTTP (padrão local: `3001`) |
| `FRONTEND_URL` / `CORS_ORIGINS` | Origens CORS |
| `DATABASE_URL` | Connection string Postgres |
| `POSTGRES_*` | Credenciais usadas pelo `docker-compose` |
| `JWT_SECRET` | Segredo JWT (forte e único; não commitar valor real) |
| `SMTP_*` / `STMP_FROM_EMAIL` | Envio de e-mail |
| `SEED_PASSWORD` | Senha dos usuários do seed |

Não commite o arquivo `.env`.

## Scripts úteis

| Comando | Equivalente Make | Descrição |
|---|---|---|
| `make setup` | — | Postgres + `npm install` + `prisma db push` |
| `make infra` / `make infra-down` | — | Sobe/para Postgres |
| `npm run prisma:migrate` | `make migrate` | `prisma db push` (sincroniza schema) |
| `npm run seed` | `make seed` | Seed (limpa e recria dados) |
| `npm run start:dev` | `make dev` | Nest em watch |
| `npm run start` | — | Nest sem watch |
| `npm run start:prod` | — | `prisma migrate deploy` + `node dist/main` |
| `npm run build` | `make build` | Build Nest |
| `npm run lint` | — | ESLint |
| `npm test` | `make test` | Testes unitários |
| `npm run test:e2e` | — | Testes e2e |
| `npm run test:cov` | — | Coverage |
| `npm run swagger:export` | — | Exporta OpenAPI |

## Contribuição

A branch **`main` está protegida**: não faça push direto nela.

1. Crie uma branch a partir de `main` com o padrão **`issue-#x`** (ex.: `issue-#19`). Para tarefas sem issue, use prefixo descritivo (`chore/…`, `docs/…`, `fix/…`).
2. Implemente, rode localmente o que for relevante (`npm run lint`, `npm test`, `npm run build`).
3. Abra um **Pull Request para `main`**.
4. Preencha o [template de PR](.github/PULL_REQUEST_TEMPLATE.md).
5. Aguarde **pelo menos 1 aprovação** de revisor.
6. O **CI** do GitHub Actions (lint, build, testes unitários; Prisma generate) deve ficar verde.
7. O **CodeRabbit** (`.coderabbit.yaml`) comenta automaticamente nos PRs para `main` — use como apoio, não substitui a review humana.

Não existe mais fluxo com branch `development` / `master` intermediária.

### Checklist rápido do PR

- [ ] Branch `issue-#x` (ou prefixo chore/docs/fix)
- [ ] PR aberto contra `main`
- [ ] ≥ 1 aprovador
- [ ] CI verde
- [ ] Sem secrets / `.env` no diff

## Convenções de nomes

- **Código em inglês** (variáveis, métodos, arquivos, DTOs, módulos).
- Organização por feature module: `feature.module.ts`, `feature.controller.ts`, `feature.service.ts`, `dto/`.
- Pastas de domínio em kebab-case (`presentation-block`, `evaluation-criteria`, …).
- Antes de criar um método/serviço, verifique se já existe; evite camadas e interfaces desnecessárias.
- Prefira nomes legíveis; não atualize dependências sem necessidade e sem validar build/testes.
- Erros via exceções do Nest/`AppException`; não logar senhas, tokens ou PII.

## Links úteis

- Repositório: [portalwepgcomp/portal-wepgcomp-api](https://github.com/portalwepgcomp/portal-wepgcomp-api)
- Issues: [Issues](https://github.com/portalwepgcomp/portal-wepgcomp-api/issues)
- Frontend: [portal-wepgcomp-frontend](https://github.com/portalwepgcomp/portal-wepgcomp-frontend)
- Produção: https://wepgcomp-api.app.ic.ufba.br
- Deploy: remote Dokku `wepgcomp-api` (mantenedores)

