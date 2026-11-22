export interface StackLocation {
  file: string;
  line: number;
  column: number;
  functionName?: string;
}

const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
const PROJECT_DIR = /\/(src|dist)\//;

function normalizePath(rawPath: string): string {
  return rawPath.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
}

function toProjectRelative(path: string): string {
  const matches = [...path.matchAll(/\/(src|dist)\//g)];
  const last = matches[matches.length - 1];
  return last?.index !== undefined ? path.slice(last.index + 1) : path;
}

/**
 * Primeiro frame da stack que pertence ao projeto (`src/` ou `dist/`, fora de
 * `node_modules`). Com `--enable-source-maps` o frame já aponta para o `.ts`.
 */
export function parseStackLocation(stack?: string): StackLocation | undefined {
  if (!stack) {
    return undefined;
  }

  for (const rawLine of stack.split('\n')) {
    const match = FRAME.exec(rawLine);
    if (!match) {
      continue;
    }

    const [, rawFunction, rawPath, line, column] = match;
    const path = normalizePath(rawPath);
    if (
      path.includes('/node_modules/') ||
      path.startsWith('node:') ||
      !PROJECT_DIR.test(path)
    ) {
      continue;
    }

    const functionName = rawFunction?.replace(/^async\s+/, '').trim();
    return {
      file: toProjectRelative(path),
      line: Number(line),
      column: Number(column),
      functionName: functionName || undefined,
    };
  }

  return undefined;
}
