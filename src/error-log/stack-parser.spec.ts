import { parseStackLocation } from './stack-parser';

describe('parseStackLocation', () => {
  it('escolhe o primeiro frame do projeto e ignora node_modules e internos', () => {
    const stack = [
      'PrismaClientKnownRequestError: Unique constraint failed',
      '    at Rn.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7315)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
      '    at async SubmissionService.create (/app/src/submission/submission.service.ts:57:12)',
      '    at async SubmissionController.create (/app/src/submission/submission.controller.ts:40:5)',
    ].join('\n');

    expect(parseStackLocation(stack)).toEqual({
      file: 'src/submission/submission.service.ts',
      line: 57,
      column: 12,
      functionName: 'SubmissionService.create',
    });
  });

  it('normaliza caminhos do Windows e frames sem nome de função', () => {
    const stack = [
      'Error: boom',
      '    at C:\\Users\\dev\\api\\dist\\certificate\\certificate.service.js:10:3',
    ].join('\n');

    expect(parseStackLocation(stack)).toEqual({
      file: 'dist/certificate/certificate.service.js',
      line: 10,
      column: 3,
      functionName: undefined,
    });
  });

  it('usa o último diretório src/ do caminho', () => {
    const stack =
      'Error: x\n    at fn (/home/u/src/projects/api/src/user/user.service.ts:1:2)';

    expect(parseStackLocation(stack)?.file).toBe('src/user/user.service.ts');
  });

  it('retorna undefined sem stack ou sem frame do projeto', () => {
    expect(parseStackLocation(undefined)).toBeUndefined();
    expect(
      parseStackLocation(
        'Error: x\n    at fn (/app/node_modules/lib/src/index.js:1:1)',
      ),
    ).toBeUndefined();
  });
});
