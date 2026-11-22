import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ErrorLogQueryDto,
  ErrorLogSummaryQueryDto,
} from './error-log-query.dto';

async function errorsFor(
  plain: Record<string, unknown>,
  type: typeof ErrorLogQueryDto = ErrorLogQueryDto,
): Promise<string[]> {
  const dto = plainToInstance(type, plain);
  const errors = await validate(dto, { whitelist: true });
  return errors.map((error) => error.property);
}

describe('ErrorLogQueryDto', () => {
  it('aceita uma consulta completa e válida', async () => {
    await expect(
      errorsFor({
        userEmail: '@ufba.br',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-21T23:59:59.000Z',
        statusCode: '500,502',
        statusClass: '5xx',
        source: 'http,cron',
        level: 'error',
        method: 'post',
        userLevel: 'Admin',
        userProfile: 'Professor,Presenter',
        isAuthenticated: 'true',
        sortBy: 'statusCode',
        sortOrder: 'asc',
        pageSize: '100',
      }),
    ).resolves.toEqual([]);
  });

  it('aceita parâmetro repetido como lista', () => {
    const dto = plainToInstance(ErrorLogQueryDto, {
      source: ['http', 'logger'],
    });
    expect(dto.source).toEqual(['http', 'logger']);
  });

  it('converte isAuthenticated=false corretamente', () => {
    const dto = plainToInstance(ErrorLogQueryDto, { isAuthenticated: 'false' });
    expect(dto.isAuthenticated).toBe(false);
  });

  it('rejeita `to` anterior a `from`', async () => {
    await expect(
      errorsFor({ from: '2026-11-21', to: '2026-11-01' }),
    ).resolves.toEqual(['to']);
  });

  it('rejeita pageSize acima de 100', async () => {
    await expect(errorsFor({ pageSize: '101' })).resolves.toEqual(['pageSize']);
  });

  it('rejeita sortBy fora da lista branca', async () => {
    await expect(errorsFor({ sortBy: 'context' })).resolves.toEqual(['sortBy']);
  });

  it.each([
    ['source', 'http,email'],
    ['level', 'info'],
    ['statusCode', '500,abc'],
    ['statusCode', '700'],
    ['statusClass', '3xx'],
    ['method', 'TRACE'],
    ['userLevel', 'Root'],
    ['userProfile', 'Aluno'],
    ['from', 'ontem'],
  ])('rejeita %s=%s', async (property, value) => {
    await expect(errorsFor({ [property]: value })).resolves.toEqual([property]);
  });
});

describe('ErrorLogSummaryQueryDto', () => {
  it('exige groupBy da lista branca', async () => {
    await expect(
      errorsFor({}, ErrorLogSummaryQueryDto as typeof ErrorLogQueryDto),
    ).resolves.toEqual(['groupBy']);
    await expect(
      errorsFor(
        { groupBy: 'message' },
        ErrorLogSummaryQueryDto as typeof ErrorLogQueryDto,
      ),
    ).resolves.toEqual(['groupBy']);
    await expect(
      errorsFor(
        { groupBy: 'day' },
        ErrorLogSummaryQueryDto as typeof ErrorLogQueryDto,
      ),
    ).resolves.toEqual([]);
  });
});
