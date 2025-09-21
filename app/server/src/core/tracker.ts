import fs from 'fs';
import path from 'path';
import { logger, sanitize } from './log';

export interface TrackedSession {
  id: string;
  pid?: number;
  command: string[];
  cwd: string;
  status: 'running' | 'exited';
  createdAt: string;
  exitedAt?: string;
  exitCode?: number | null;
}

function fileFor(cwd: string) {
  return path.join(cwd, '.multiterm', 'sessions.json');
}

function readList(cwd: string): TrackedSession[] {
  try {
    const f = fileFor(cwd);
    if (!fs.existsSync(f)) return [];
    const data = JSON.parse(fs.readFileSync(f, 'utf8')) as { sessions: TrackedSession[] } | TrackedSession[];
    return Array.isArray(data) ? data : data.sessions || [];
  } catch (e) {
    logger.warn('tracker.read_failed', { cwd: sanitize(cwd), err: String(e) });
    return [];
  }
}

function writeList(cwd: string, list: TrackedSession[]) {
  try {
    const f = fileFor(cwd);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // Keep at most 100 historical entries
    const trimmed = list.slice(-100);
    fs.writeFileSync(f, JSON.stringify({ sessions: trimmed }, null, 2));
  } catch (e) {
    logger.warn('tracker.write_failed', { cwd: sanitize(cwd), err: String(e) });
  }
}

export function recordStart(entry: Omit<TrackedSession, 'status'>) {
  const list = readList(entry.cwd);
  const exists = list.find((s) => s.id === entry.id);
  const item: TrackedSession = { ...entry, status: 'running' };
  if (exists) Object.assign(exists, item);
  else list.push(item);
  writeList(entry.cwd, list);
  logger.info('tracker.start', { id: entry.id, pid: entry.pid, cwd: sanitize(entry.cwd) });
}

export function recordExit(cwd: string, id: string, exitCode: number | null | undefined) {
  const list = readList(cwd);
  const s = list.find((x) => x.id === id);
  if (s) {
    s.status = 'exited';
    s.exitCode = exitCode ?? null;
    s.exitedAt = new Date().toISOString();
    writeList(cwd, list);
  }
}

export function listTracked(cwds: string[]): TrackedSession[] {
  const all: TrackedSession[] = [];
  for (const c of cwds) all.push(...readList(c));
  return all;
}

