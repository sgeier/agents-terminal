"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultShell = defaultShell;
exports.spawnProcess = spawnProcess;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const log_1 = require("./log");
// Attempt to import node-pty lazily
function tryNodePty() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');
        return pty;
    }
    catch (e) {
        log_1.logger.warn('pty.unavailable', { err: String(e) });
        return undefined;
    }
}
function defaultShell() {
    const platform = os_1.default.platform();
    if (platform === 'win32') {
        const cmd = process.env.ComSpec || 'powershell.exe';
        if (cmd.toLowerCase().includes('powershell')) {
            return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] };
        }
        return { cmd: 'cmd.exe', args: [] };
    }
    const shell = process.env.SHELL || '/bin/bash';
    // login shell for bash/zsh
    const base = path_1.default.basename(shell);
    if (base === 'bash' || base === 'zsh' || base === 'fish') {
        return { cmd: shell, args: ['-l'] };
    }
    return { cmd: shell, args: [] };
}
function spawnProcess(cwd, argv, cols = 80, rows = 24) {
    const pty = tryNodePty();
    const usePty = !!pty;
    const shell = defaultShell();
    const cmd = argv?.[0] || shell.cmd;
    const args = argv ? argv.slice(1) : shell.args;
    if (usePty) {
        const term = pty.spawn(cmd, args, {
            name: 'xterm-color',
            cols,
            rows,
            cwd,
            env: process.env,
        });
        log_1.logger.info('spawn.pty', { cmd: (0, log_1.sanitize)(cmd), args: (0, log_1.sanitize)(args.join(' ')), cwd: (0, log_1.sanitize)(cwd) });
        return {
            pty: true,
            pid: term.pid,
            write: (d) => term.write(typeof d === 'string' ? d : d.toString('utf8')),
            resize: (c, r) => {
                try {
                    term.resize(c, r);
                }
                catch { }
            },
            kill: (signal) => {
                try {
                    term.kill(signal);
                }
                catch { }
            },
            onData: (cb) => term.onData((d) => cb(Buffer.from(d, 'utf8'))),
            onExit: (cb) => term.onExit(({ exitCode }) => cb(exitCode)),
        };
    }
    const child = (0, child_process_1.spawn)(cmd, args, {
        cwd,
        env: process.env,
        stdio: 'pipe',
    });
    log_1.logger.info('spawn.stdio', { cmd: (0, log_1.sanitize)(cmd), args: (0, log_1.sanitize)(args.join(' ')), cwd: (0, log_1.sanitize)(cwd) });
    return {
        pty: false,
        pid: child.pid,
        write: (d) => child.stdin.write(d),
        kill: (signal) => {
            try {
                child.kill(signal);
            }
            catch { }
        },
        onData: (cb) => {
            child.stdout.on('data', (d) => cb(Buffer.isBuffer(d) ? d : Buffer.from(d)));
            child.stderr.on('data', (d) => cb(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        },
        onExit: (cb) => child.on('exit', (code) => cb(code)),
    };
}
