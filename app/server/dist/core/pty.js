"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultShell = defaultShell;
exports.spawnProcess = spawnProcess;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const log_1 = require("./log");
// Attempt to import node-pty lazily
function tryNodePty() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty'); // prebuilt fork typings may not be a module; use any
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
        // Allow explicit override via env
        const override = process.env.MULTITERM_SHELL;
        const overrideArgs = (process.env.MULTITERM_SHELL_ARGS || '').trim();
        if (override) {
            const args = overrideArgs ? overrideArgs.split(/\s+/g) : [];
            return { cmd: override, args };
        }
        const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C://Windows';
        const candidates = [
            // Explicit env-provided shell
            process.env.ComSpec,
            // PowerShell 7
            'pwsh.exe',
            // Legacy Windows PowerShell
            path_1.default.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            'powershell.exe',
            // cmd
            path_1.default.join(systemRoot, 'System32', 'cmd.exe'),
            'cmd.exe',
        ].filter(Boolean);
        for (const c of candidates) {
            try {
                // If absolute/relative path contains a separator, verify it exists
                if (c.includes('\\') || c.includes('/')) {
                    if (fs_1.default.existsSync(c)) {
                        if (c.toLowerCase().includes('powershell') || path_1.default.basename(c).toLowerCase() === 'pwsh.exe') {
                            return { cmd: c, args: ['-NoLogo', '-NoProfile'] };
                        }
                        return { cmd: c, args: [] };
                    }
                }
                else {
                    // Bare command name – assume on PATH
                    if (c.toLowerCase().includes('powershell') || c.toLowerCase() === 'pwsh.exe') {
                        return { cmd: c, args: ['-NoLogo', '-NoProfile'] };
                    }
                    return { cmd: c, args: [] };
                }
            }
            catch { /* ignore and continue */ }
        }
        // Fallback
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
    let cmd = argv?.[0] || shell.cmd;
    const args = argv ? argv.slice(1) : shell.args;
    // If trying to spawn the Codex CLI but it's not on PATH, try common Windows global npm locations
    if (os_1.default.platform() === 'win32' && cmd === 'codex') {
        const override = process.env.CODEX_BIN || process.env.MULTITERM_CODEX_BIN;
        const tryResolve = () => {
            const candidates = [];
            if (override)
                candidates.push(override);
            const appdata = process.env.APPDATA;
            if (appdata) {
                candidates.push(path_1.default.join(appdata, 'npm', 'codex.cmd'));
                candidates.push(path_1.default.join(appdata, 'npm', 'codex.ps1'));
            }
            const user = process.env.USERPROFILE;
            if (user) {
                candidates.push(path_1.default.join(user, 'AppData', 'Roaming', 'npm', 'codex.cmd'));
                candidates.push(path_1.default.join(user, 'AppData', 'Roaming', 'npm', 'codex.ps1'));
            }
            const pf = process.env['ProgramFiles'];
            if (pf) {
                candidates.push(path_1.default.join(pf, 'nodejs', 'codex.cmd'));
                candidates.push(path_1.default.join(pf, 'nodejs', 'codex.ps1'));
                candidates.push(path_1.default.join(pf, 'nodejs', 'codex'));
            }
            const pf86 = process.env['ProgramFiles(x86)'];
            if (pf86) {
                candidates.push(path_1.default.join(pf86, 'nodejs', 'codex.cmd'));
                candidates.push(path_1.default.join(pf86, 'nodejs', 'codex.ps1'));
                candidates.push(path_1.default.join(pf86, 'nodejs', 'codex'));
            }
            for (const p of candidates) {
                try {
                    if (p && fs_1.default.existsSync(p)) {
                        const ext = path_1.default.extname(p).toLowerCase();
                        if (ext === '.ps1') {
                            // Run via PowerShell if only a PowerShell shim exists
                            const ps = 'powershell.exe';
                            const psArgs = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', p];
                            return { cmd: ps, args: psArgs };
                        }
                        return { cmd: p };
                    }
                }
                catch { }
            }
            return null;
        };
        const resolved = tryResolve();
        if (resolved) {
            cmd = resolved.cmd;
            if (resolved.args && resolved.args.length) {
                // Prepend wrapper args (e.g., PowerShell -File codex.ps1)
                args.unshift(...resolved.args);
            }
        }
    }
    if (usePty) {
        try {
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
        catch (err) {
            log_1.logger.error('spawn.pty.fail', { cmd: (0, log_1.sanitize)(cmd), args: (0, log_1.sanitize)(args.join(' ')), cwd: (0, log_1.sanitize)(cwd), err: String(err) });
            // fall through to stdio spawn below
        }
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
