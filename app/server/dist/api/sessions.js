"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionsRouter = sessionsRouter;
exports.shutdownAllSessions = shutdownAllSessions;
const express_1 = require("express");
const crypto_1 = require("crypto");
const projects_1 = require("./projects");
const bus_1 = require("../core/bus");
const pty_1 = require("../core/pty");
const log_1 = require("../core/log");
const tracker = __importStar(require("../core/tracker"));
const security_1 = require("../core/security");
const metrics_1 = require("../core/metrics");
const sessions = new Map();
function nowIso() { return new Date().toISOString(); }
// Simple token-bucket style input rate limit: 1 MB/s per session
function allowBytes(ls, n) {
    const now = Date.now();
    if (now - ls.lastTick >= 1000) {
        ls.bytesThisSecond = 0;
        ls.lastTick = now;
    }
    if (ls.bytesThisSecond + n > 1000000)
        return false;
    ls.bytesThisSecond += n;
    return true;
}
function sessionsRouter({ wss }) {
    const r = (0, express_1.Router)();
    r.post('/', (req, res) => {
        const { projectId, cwd, command } = req.body || {};
        let pcwd = String(cwd || '');
        const store = (0, projects_1.getStore)();
        if (projectId) {
            const proj = store.get(String(projectId));
            if (!proj)
                return res.status(400).json({ error: 'invalid projectId' });
            pcwd = proj.cwd;
        }
        if (!pcwd || !(0, security_1.validateProjectCwd)(store, pcwd)) {
            return res.status(400).json({ error: 'cwd must be a known project dir with .multiterm/project.json' });
        }
        let argv;
        if (command !== undefined) {
            if (!(0, security_1.isValidArgv)(command))
                return res.status(400).json({ error: 'command must be argv string[]' });
            argv = command;
        }
        const id = (0, crypto_1.randomUUID)();
        const bus = (0, bus_1.createSessionBus)(id);
        const proc = (0, pty_1.spawnProcess)(pcwd, argv);
        const meta = {
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
        const live = {
            meta,
            bus,
            proc,
            bytesThisSecond: 0,
            lastTick: Date.now(),
        };
        sessions.set(id, live);
        log_1.logger.info('session.spawn', { id, cwd: (0, log_1.sanitize)(pcwd), pty: proc.pty });
        try {
            metrics_1.metrics.incSpawn(proc.pty);
        }
        catch { }
        tracker.recordStart({ id, pid: proc.pid, command: argv || [], cwd: pcwd, createdAt: meta.createdAt });
        proc.onData((d) => {
            const frame = bus.push(d);
            live.meta.scrollbackLines = bus.lineCount();
            if (live.meta.status === 'starting') {
                live.meta.status = 'running';
                try {
                    metrics_1.metrics.onRunningTransition();
                }
                catch { }
                try {
                    const firstMs = Date.now() - new Date(live.meta.createdAt).getTime();
                    metrics_1.metrics.onFirstOutput(firstMs);
                }
                catch { }
            }
            // never log raw data, only sizes
            const bytes = Buffer.byteLength(d);
            log_1.logger.debug('io.output', { id, bytes });
        });
        proc.onExit((code) => {
            live.meta.status = 'exited';
            live.meta.exitedAt = nowIso();
            live.meta.exitCode = code;
            log_1.logger.info('session.exit', { id, code });
            try {
                metrics_1.metrics.onExit(code);
            }
            catch { }
            tracker.recordExit(pcwd, id, code);
        });
        res.status(201).json(meta);
    });
    r.get('/', (req, res) => {
        const list = [...sessions.values()].map((s) => s.meta);
        res.json(list);
    });
    r.get('/:id', (req, res) => {
        const live = sessions.get(req.params.id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        res.json(live.meta);
    });
    r.post('/:id/stop', (req, res) => {
        const live = sessions.get(req.params.id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        try {
            live.proc.kill('SIGTERM');
        }
        catch { }
        setTimeout(() => { try {
            live.proc.kill('SIGKILL');
        }
        catch { } ; }, 3000);
        res.json({ ok: true });
    });
    r.delete('/:id', (req, res) => {
        const id = req.params.id;
        const live = sessions.get(id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        try {
            live.proc.kill('SIGKILL');
        }
        catch { }
        sessions.delete(id);
        res.json({ ok: true });
    });
    // List tracked sessions across known projects (running/exited)
    r.get('/opened/all', (req, res) => {
        const store = (0, projects_1.getStore)();
        const cwds = store.list().map((p) => p.cwd);
        const items = tracker.listTracked(cwds);
        res.json({ sessions: items });
    });
    r.post('/:id/resize', (req, res) => {
        const live = sessions.get(req.params.id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        const { cols, rows } = req.body || {};
        if (typeof cols === 'number' && typeof rows === 'number' && live.proc.resize) {
            try {
                live.proc.resize(cols, rows);
            }
            catch { }
        }
        res.json({ ok: true });
    });
    r.get('/:id/scrollback', (req, res) => {
        const live = sessions.get(req.params.id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        const from = Number(req.query.from || 0);
        const frames = live.bus.getFrom(from);
        const to = frames.length ? frames[frames.length - 1].seq : from;
        res.json({ from, to, frames });
    });
    r.post('/:id/input', (req, res) => {
        const live = sessions.get(req.params.id);
        if (!live)
            return res.status(404).json({ error: 'not found' });
        const chunk = req.body;
        if (!chunk || typeof chunk.dataBase64 !== 'string')
            return res.status(400).json({ error: 'invalid chunk' });
        const data = Buffer.from(chunk.dataBase64, 'base64');
        if (data.length > 32 * 1024)
            return res.status(413).json({ error: 'chunk too large' });
        if (!allowBytes(live, data.length))
            return res.status(429).json({ error: 'rate limited' });
        live.proc.write(data);
        log_1.logger.debug('io.input', { id: live.meta.id, bytes: data.length });
        try {
            metrics_1.metrics.addInputBytes(data.length);
        }
        catch { }
        res.json({ ok: true });
    });
    // Attach WS handling on the passed WebSocketServer
    wss.on('connection', (ws, req) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (!url.pathname.startsWith('/api/sessions/') || !url.pathname.endsWith('/stream'))
            return;
        const id = url.pathname.split('/')[3];
        const live = sessions.get(id);
        if (!live) {
            ws.close(1008, 'no such session');
            return;
        }
        const from = url.searchParams.get('from');
        const fromSeq = from ? Number(from) : undefined;
        live.bus.addSubscriber(ws, fromSeq);
        log_1.logger.info('ws.connect', { sessionId: id });
        try {
            metrics_1.metrics.wsConnect();
        }
        catch { }
        ws.on('message', (msg) => {
            // treat as InputChunk frames
            try {
                const chunk = JSON.parse(String(msg));
                const data = Buffer.from(chunk.dataBase64, 'base64');
                if (data.length > 32 * 1024)
                    return; // drop oversize
                if (!allowBytes(live, data.length))
                    return; // rate-limited
                live.proc.write(data);
                log_1.logger.debug('io.input.ws', { id, bytes: data.length });
            }
            catch { }
        });
        ws.on('close', () => {
            live.bus.removeSubscriber(ws);
            log_1.logger.info('ws.disconnect', { sessionId: id });
            try {
                metrics_1.metrics.wsDisconnect();
            }
            catch { }
        });
    });
    return r;
}
// Gracefully stop all live sessions (TERM → KILL after 3s)
function shutdownAllSessions() {
    for (const [id, live] of sessions.entries()) {
        try {
            live.proc.kill('SIGTERM');
        }
        catch { }
        setTimeout(() => { try {
            live.proc.kill('SIGKILL');
        }
        catch { } ; }, 3000);
    }
}
