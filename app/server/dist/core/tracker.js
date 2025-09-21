"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordStart = recordStart;
exports.recordExit = recordExit;
exports.listTracked = listTracked;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const log_1 = require("./log");
function fileFor(cwd) {
    return path_1.default.join(cwd, '.multiterm', 'sessions.json');
}
function readList(cwd) {
    try {
        const f = fileFor(cwd);
        if (!fs_1.default.existsSync(f))
            return [];
        const data = JSON.parse(fs_1.default.readFileSync(f, 'utf8'));
        return Array.isArray(data) ? data : data.sessions || [];
    }
    catch (e) {
        log_1.logger.warn('tracker.read_failed', { cwd: (0, log_1.sanitize)(cwd), err: String(e) });
        return [];
    }
}
function writeList(cwd, list) {
    try {
        const f = fileFor(cwd);
        fs_1.default.mkdirSync(path_1.default.dirname(f), { recursive: true });
        // Keep at most 100 historical entries
        const trimmed = list.slice(-100);
        fs_1.default.writeFileSync(f, JSON.stringify({ sessions: trimmed }, null, 2));
    }
    catch (e) {
        log_1.logger.warn('tracker.write_failed', { cwd: (0, log_1.sanitize)(cwd), err: String(e) });
    }
}
function recordStart(entry) {
    const list = readList(entry.cwd);
    const exists = list.find((s) => s.id === entry.id);
    const item = { ...entry, status: 'running' };
    if (exists)
        Object.assign(exists, item);
    else
        list.push(item);
    writeList(entry.cwd, list);
    log_1.logger.info('tracker.start', { id: entry.id, pid: entry.pid, cwd: (0, log_1.sanitize)(entry.cwd) });
}
function recordExit(cwd, id, exitCode) {
    const list = readList(cwd);
    const s = list.find((x) => x.id === id);
    if (s) {
        s.status = 'exited';
        s.exitCode = exitCode ?? null;
        s.exitedAt = new Date().toISOString();
        writeList(cwd, list);
    }
}
function listTracked(cwds) {
    const all = [];
    for (const c of cwds)
        all.push(...readList(c));
    return all;
}
