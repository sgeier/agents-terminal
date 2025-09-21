type Level = 'info' | 'warn' | 'error' | 'debug';

function ts() {
  return new Date().toISOString();
}

export function sanitize(input: unknown): string {
  try {
    const s = String(input ?? '');
    return s.replace(/[\r\n\t]+/g, ' ').slice(0, 2000);
  } catch {
    return '';
  }
}

export function log(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  const entry = { ts: ts(), level, msg, ...meta };
  const line = JSON.stringify(entry);
  // eslint-disable-next-line no-console
  console.log(line);
}

export const logger = {
  info: (msg: string, meta: Record<string, unknown> = {}) => log('info', msg, meta),
  warn: (msg: string, meta: Record<string, unknown> = {}) => log('warn', msg, meta),
  error: (msg: string, meta: Record<string, unknown> = {}) => log('error', msg, meta),
  debug: (msg: string, meta: Record<string, unknown> = {}) => log('debug', msg, meta),
};

