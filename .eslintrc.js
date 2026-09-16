module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Bloqueia `any` em código novo. Arquivos com dívida pré-existente estão
    // no override abaixo — remova o path ao tipar o arquivo.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.spec.ts', 'test/**/*.ts'],
      rules: {
        // Mocks Jest ainda usam `any` em massa; tipar testes gradualmente.
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
      },
    },
    {
      // Dívida técnica pré-existente (75 ocorrências). Novos arquivos fora
      // desta lista já falham o CI com no-explicit-any.
      files: [
        'src/auth/strategies/jwt.strategy.ts',
        'src/awarded-presenters/dto/response-awarded-presenters.dto.ts',
        'src/certificate/certificate-eligibility.service.ts',
        'src/certificate/certificate-generator.service.ts',
        'src/certificate/certificate.controller.ts',
        'src/certificate/certificate.service.ts',
        'src/committee-member/committee-member.service.ts',
        'src/config/log.config.ts',
        'src/evaluation/evaluation.controller.ts',
        'src/evaluation/evaluation.service.ts',
        'src/interceptors/logging.interceptor.ts',
        'src/mailing/mailing.service.ts',
        'src/presentation-block/dto/response-presentation-block.dto.ts',
        'src/presentation-block/presentation-block-time.service.ts',
        'src/presentation-block/presentation-block.controller.ts',
        'src/presentation-block/presentation-block.service.ts',
        'src/presentation/presentation.controller.ts',
        'src/submission/dto/response-submission.dto.ts',
        'src/submission/submission.controller.ts',
        'src/user/user-admin.service.ts',
        'src/user/user.controller.ts',
        'src/user/user.service.ts',
        'src/user/utils/user-field-calculator.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
