## Contribuções:
- Todo merge request deve seguir a padronização em inglês para variáveis e métodos dentro do código.
- Certifique-se antes de criar um método, se ele já não existe.
- Evite criar interfaces e métodos desnecessários
- Evitar muitas camadas para realizar uma ação
- Certifique-se de que não houve atualiações em bibliotecas que possam quebrar o código
- Certifique-se de que seu código e variáveis estão os mais legíveis possível.
- Abra um Merge Request para a branch **development** e solicite aprovação das outras pessoas do grupo.
- Peça ao grupo que teste as funcionalidades implementadas e comunique o que há de alteração.
- Após ter o aprove, abra um Merge Request para a **master** e solicite aprovação
- Comunique aos mantenedores para que seja feito o deploy.

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456

## Instalação

```bash
$ npm install
```

## Configurar banco
### Execute e preencherá o banco de dados corretamente

**Importante:** Antes de executar o seed, configure a variável de ambiente `SEED_PASSWORD`:

```bash
# Defina a senha para os usuários do seed
export SEED_PASSWORD=suaSenhaAqui

# Em seguida, execute as migrações e o seed
npm run prisma:migrate
npm run seed
```

**Nota:** Se a variável `SEED_PASSWORD` não for definida, o script usará a senha padrão `defaultPassword123!` para todos os usuários criados.

### Re-executar o seed (limpar dados existentes)

Se você precisar limpar os dados existentes e executar o seed novamente:

```bash
# Força a limpeza e re-criação dos dados
FORCE_RESEED=true npm run seed
```

**Atenção:** O comando `FORCE_RESEED=true` irá **deletar todos os dados** do banco antes de recriar.

## Execução

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Ambientes

- Desenvolvimento: https://wepgcomp-api.onrender.com/
- Produção: https://wepgcomp-api.app.ic.ufba.br
