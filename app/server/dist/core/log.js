"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.sanitize = sanitize;
exports.log = log;
function ts() {
    return new Date().toISOString();
}
function sanitize(input) {
    try {
        const s = String(input ?? '');
        return s.replace(/[\r\n\t]+/g, ' ').slice(0, 2000);
    }
    catch {
        return '';
    }
}
const ORDER = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
// Resolve log level once at module load
const rawLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const effectiveLevel = rawLevel === 'off' || rawLevel === 'silent' || rawLevel === 'none'
    ? 'silent'
    : (['debug', 'info', 'warn', 'error'].includes(rawLevel)
        ? rawLevel
        : 'info');
const THRESHOLD = effectiveLevel === 'silent' ? Infinity : ORDER[effectiveLevel];
function log(level, msg, meta = {}) {
    // Fast path: skip building log entry if below threshold
    if (ORDER[level] < THRESHOLD)
        return;
    const entry = { ts: ts(), level, msg, ...meta };
    const line = JSON.stringify(entry);
    // eslint-disable-next-line no-console
    console.log(line);
}
exports.logger = {
    info: (msg, meta = {}) => log('info', msg, meta),
    warn: (msg, meta = {}) => log('warn', msg, meta),
    error: (msg, meta = {}) => log('error', msg, meta),
    debug: (msg, meta = {}) => log('debug', msg, meta),
};
