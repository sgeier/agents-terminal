type Level = 'debug' | 'info' | 'warn' | 'error';

type LevelSetting = Level | 'silent' | 'off' | 'none';

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

const ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Resolve log level once at module load
const rawLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase() as LevelSetting;
const effectiveLevel: Level | 'silent' =
  rawLevel === 'off' || rawLevel === 'silent' || rawLevel === 'none'
    ? 'silent'
    : (['debug', 'info', 'warn', 'error'].includes(rawLevel as string)
        ? (rawLevel as Level)
        : 'info');

const THRESHOLD = effectiveLevel === 'silent' ? Infinity : ORDER[effectiveLevel];

export function log(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  // Fast path: skip building log entry if below threshold
  if (ORDER[level] < THRESHOLD) return;
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
