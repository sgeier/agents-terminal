import { Router } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { getStore } from './projects';
import { TerminalSession, OutputFrame, InputChunk } from '../types/domain';
import { createSessionBus } from '../core/bus';
import { spawnProcess } from '../core/pty';
import { logger, sanitize } from '../core/log';
import { validateProjectCwd, isValidArgv } from '../core/security';

interface LiveSession {
  meta: TerminalSession;
  bus: ReturnType<typeof createSessionBus>;
  proc: ReturnType<typeof spawnProcess>;
  bytesThisSecond: number;
  lastTick: number;
}

const sessions = new Map<string, LiveSession>();

function nowIso() { return new Date().toISOString(); }

// Simple token-bucket style input rate limit: 1 MB/s per session
function allowBytes(ls: LiveSession, n: number): boolean {
  const now = Date.now();
  if (now - ls.lastTick >= 1000) {
    ls.bytesThisSecond = 0;
    ls.lastTick = now;
  }
  if (ls.bytesThisSecond + n > 1_000_000) return false;
  ls.bytesThisSecond += n;
  return true;
}

export interface SessionsRouterOptions {
  wss: WebSocketServer;
}

export function sessionsRouter({ wss }: SessionsRouterOptions) {
  const r = Router();

  r.post('/', (req, res) => {
    const { projectId, cwd, command } = req.body || {};

    let pcwd = String(cwd || '');
    const store = getStore();
    if (projectId) {
      const proj = store.get(String(projectId));
      if (!proj) return res.status(400).json({ error: 'invalid projectId' });
      pcwd = proj.cwd;
    }
    if (!pcwd || !validateProjectCwd(store, pcwd)) {
      return res.status(400).json({ error: 'cwd must be a known project dir with .multiterm/project.json' });
    }

    let argv: string[] | undefined;
    if (command !== undefined) {
      if (!isValidArgv(command)) return res.status(400).json({ error: 'command must be argv string[]' });
      argv = command as string[];
    }

    const id = randomUUID();
    const bus = createSessionBus(id);
    const proc = spawnProcess(pcwd, argv);
    const meta: TerminalSession = {
      id,
      projectId: projectId ? String(projectId) : 'adhoc',
      pid: proc.pid,
      cwd: pcwd,
      command: argv || [],
      status: 'starting',
      createdAt: nowIso(),
      scrollbackLines: 0,
      pty: proc.pty,
    };

    const live: LiveSession = {
      meta,
      bus,
      proc,
      bytesThisSecond: 0,
      lastTick: Date.now(),
    };
    sessions.set(id, live);
    logger.info('session.spawn', { id, cwd: sanitize(pcwd), pty: proc.pty });

    proc.onData((d) => {
      const frame = bus.push(d);
      live.meta.scrollbackLines = bus.lineCount();
      if (live.meta.status === 'starting') live.meta.status = 'running';
      // never log raw data, only sizes
      logger.debug('io.output', { id, bytes: Buffer.byteLength(d) });
    });
    proc.onExit((code) => {
      live.meta.status = 'exited';
      live.meta.exitedAt = nowIso();
      live.meta.exitCode = code;
      logger.info('session.exit', { id, code });
    });

    res.status(201).json(meta);
  });

  r.get('/', (req, res) => {
    const list = [...sessions.values()].map((s) => s.meta);
    res.json(list);
  });

  r.get('/:id', (req, res) => {
    const live = sessions.get(req.params.id);
    if (!live) return res.status(404).json({ error: 'not found' });
    res.json(live.meta);
  });

  r.post('/:id/stop', (req, res) => {
    const live = sessions.get(req.params.id);
    if (!live) return res.status(404).json({ error: 'not found' });
    try { live.proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { live.proc.kill('SIGKILL'); } catch {}; }, 3000);
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    const id = req.params.id;
    const live = sessions.get(id);
    if (!live) return res.status(404).json({ error: 'not found' });
    try { live.proc.kill('SIGKILL'); } catch {}
    sessions.delete(id);
    res.json({ ok: true });
  });

  r.post('/:id/resize', (req, res) => {
    const live = sessions.get(req.params.id);
    if (!live) return res.status(404).json({ error: 'not found' });
    const { cols, rows } = req.body || {};
    if (typeof cols === 'number' && typeof rows === 'number' && live.proc.resize) {
      try { live.proc.resize(cols, rows); } catch {}
    }
    res.json({ ok: true });
  });

  r.get('/:id/scrollback', (req, res) => {
    const live = sessions.get(req.params.id);
    if (!live) return res.status(404).json({ error: 'not found' });
    const from = Number(req.query.from || 0);
    const frames = live.bus.getFrom(from);
    const to = frames.length ? frames[frames.length - 1].seq : from;
    res.json({ from, to, frames });
  });

  r.post('/:id/input', (req, res) => {
    const live = sessions.get(req.params.id);
    if (!live) return res.status(404).json({ error: 'not found' });
    const chunk = req.body as InputChunk;
    if (!chunk || typeof chunk.dataBase64 !== 'string') return res.status(400).json({ error: 'invalid chunk' });
    const data = Buffer.from(chunk.dataBase64, 'base64');
    if (data.length > 32 * 1024) return res.status(413).json({ error: 'chunk too large' });
    if (!allowBytes(live, data.length)) return res.status(429).json({ error: 'rate limited' });
    live.proc.write(data);
    logger.debug('io.input', { id: live.meta.id, bytes: data.length });
    res.json({ ok: true });
  });

  // Attach WS handling on the passed WebSocketServer
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    if (!url.pathname.startsWith('/api/sessions/') || !url.pathname.endsWith('/stream')) return;
    const id = url.pathname.split('/')[3];
    const live = sessions.get(id);
    if (!live) {
      ws.close(1008, 'no such session');
      return;
    }
    const from = url.searchParams.get('from');
    const fromSeq = from ? Number(from) : undefined;
    live.bus.addSubscriber(ws, fromSeq);
    logger.info('ws.connect', { sessionId: id });

    ws.on('message', (msg) => {
      // treat as InputChunk frames
      try {
        const chunk = JSON.parse(String(msg)) as InputChunk;
        const data = Buffer.from(chunk.dataBase64, 'base64');
        if (data.length > 32 * 1024) return; // drop oversize
        if (!allowBytes(live, data.length)) return; // rate-limited
        live.proc.write(data);
        logger.debug('io.input.ws', { id, bytes: data.length });
      } catch {}
    });
    ws.on('close', () => {
      live.bus.removeSubscriber(ws);
      logger.info('ws.disconnect', { sessionId: id });
    });
  });

  return r;
}

