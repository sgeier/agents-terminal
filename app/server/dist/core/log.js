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
function log(level, msg, meta = {}) {
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
