import {
  limitContextSize,
  MAX_ARRAY_ITEMS,
  MAX_DEPTH,
  MAX_STRING_LENGTH,
  REDACTED,
  sanitize,
  TRUNCATED,
} from './error-log.sanitizer';

describe('sanitize', () => {
  it('redige chaves sensíveis sem diferenciar maiúsculas', () => {
    const result = sanitize({
      email: 'a@b.com',
      password: '123',
      newPassword: 'abc',
      Senha: 'x',
      resetToken: 't',
      clientSecret: 's',
      Authorization: 'Bearer x',
      cookie: 'c',
      passwordHash: 'h',
    });

    expect(result).toEqual({
      email: 'a@b.com',
      password: REDACTED,
      newPassword: REDACTED,
      Senha: REDACTED,
      resetToken: REDACTED,
      clientSecret: REDACTED,
      Authorization: REDACTED,
      cookie: REDACTED,
      passwordHash: REDACTED,
    });
  });

  it('redige valores que parecem hash bcrypt ou JWT em qualquer chave', () => {
    const bcrypt = '$2b$10$abcdefghijklmnopqrstuuJ1h3Z0b8m1Qn7xX1Yz6E8Zp2a';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.c2lnbmF0dXJl';

    expect(sanitize({ data: { value: bcrypt, other: jwt } })).toEqual({
      data: { value: REDACTED, other: REDACTED },
    });
  });

  it('trunca strings longas e arrays grandes', () => {
    const longString = 'a'.repeat(MAX_STRING_LENGTH + 10);
    const bigArray = Array.from({ length: MAX_ARRAY_ITEMS + 5 }, (_, i) => i);

    const result = sanitize({ longString, bigArray }) as {
      longString: string;
      bigArray: unknown[];
    };

    expect(result.longString).toHaveLength(
      MAX_STRING_LENGTH + '...[+10 chars]'.length,
    );
    expect(result.bigArray).toHaveLength(MAX_ARRAY_ITEMS + 1);
    expect(result.bigArray[MAX_ARRAY_ITEMS]).toBe('[+5 items]');
  });

  it('limita a profundidade', () => {
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < MAX_DEPTH + 2; i++) {
      nested = { child: nested };
    }

    const serialized = JSON.stringify(sanitize(nested));
    expect(serialized).toContain('[MaxDepth]');
    expect(serialized).not.toContain('leaf');
  });

  it('marca referências circulares sem confundir com referências repetidas', () => {
    const shared = { id: 1 };
    const circular: Record<string, unknown> = { a: shared, b: shared };
    circular.self = circular;

    expect(sanitize(circular)).toEqual({
      a: { id: 1 },
      b: { id: 1 },
      self: '[Circular]',
    });
  });

  it('converte Buffer, BigInt, Date e Error em valores serializáveis', () => {
    const date = new Date('2026-11-21T10:00:00.000Z');
    const result = sanitize({
      buffer: Buffer.from('abc'),
      big: BigInt(10),
      date,
      error: new TypeError('boom'),
      missing: undefined,
    }) as Record<string, unknown>;

    expect(result.buffer).toBe('[Binary 3 bytes]');
    expect(result.big).toBe('10');
    expect(result.date).toBe('2026-11-21T10:00:00.000Z');
    expect(result.error).toMatchObject({ name: 'TypeError', message: 'boom' });
    expect(result).not.toHaveProperty('missing');
  });
});

describe('limitContextSize', () => {
  it('não altera contextos dentro do limite', () => {
    const context = { stack: 'Error: x', request: { body: { a: 1 } } };
    expect(limitContextSize(context, 1024)).toEqual(context);
  });

  it('descarta primeiro o body da requisição e marca truncated', () => {
    const context = {
      stack: 'Error: x',
      request: { body: { text: 'x'.repeat(5000) }, ip: '127.0.0.1' },
    };

    const result = limitContextSize(context, 1024);

    expect(result.truncated).toBe(true);
    expect(result.request?.body).toBe(TRUNCATED);
    expect(result.request?.ip).toBe('127.0.0.1');
    expect(result.stack).toBe('Error: x');
  });

  it('em último caso mantém só a stack truncada e o runtime', () => {
    const context = {
      stack: 's'.repeat(10000),
      runtime: { pid: 1 },
      handler: { controller: 'c'.repeat(5000), method: 'm' },
    };

    const result = limitContextSize(context, 1024);

    expect(Object.keys(result).sort()).toEqual([
      'runtime',
      'stack',
      'truncated',
    ]);
    expect(result.stack!.length).toBeLessThan(10000);
  });
});
