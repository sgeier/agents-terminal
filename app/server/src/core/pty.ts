import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn as spawnChild, ChildProcessWithoutNullStreams } from 'child_process';
import { logger, sanitize } from './log';

export interface SpawnResult {
  pty: boolean;
  pid: number | undefined;
  write(data: Buffer | string): void;
  resize?(cols: number, rows: number): void;
  kill(signal?: NodeJS.Signals | number): void;
  onData(cb: (data: Buffer) => void): void;
  onExit(cb: (code: number | null) => void): void;
}

// Attempt to import node-pty lazily
function tryNodePty() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pty = require('node-pty') as any; // prebuilt fork typings may not be a module; use any
    return pty;
  } catch (e) {
    logger.warn('pty.unavailable', { err: String(e) });
    return undefined;
  }
}

export function defaultShell(): { cmd: string; args: string[] } {
  const platform = os.platform();
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
      path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      'powershell.exe',
      // cmd
      path.join(systemRoot, 'System32', 'cmd.exe'),
      'cmd.exe',
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      try {
        // If absolute/relative path contains a separator, verify it exists
        if (c.includes('\\') || c.includes('/')) {
          if (fs.existsSync(c)) {
            if (c.toLowerCase().includes('powershell') || path.basename(c).toLowerCase() === 'pwsh.exe') {
              return { cmd: c, args: ['-NoLogo', '-NoProfile'] };
            }
            return { cmd: c, args: [] };
          }
        } else {
          // Bare command name – assume on PATH
          if (c.toLowerCase().includes('powershell') || c.toLowerCase() === 'pwsh.exe') {
            return { cmd: c, args: ['-NoLogo', '-NoProfile'] };
          }
          return { cmd: c, args: [] };
        }
      } catch { /* ignore and continue */ }
    }
    // Fallback
    return { cmd: 'cmd.exe', args: [] };
  }
  const shell = process.env.SHELL || '/bin/bash';
  // login shell for bash/zsh
  const base = path.basename(shell);
  if (base === 'bash' || base === 'zsh' || base === 'fish') {
    return { cmd: shell, args: ['-l'] };
  }
  return { cmd: shell, args: [] };
}

function resolveWindowsCli(command: string, extra?: { overrideKeys?: string[]; extraCandidates?: string[] }) {
  const overrides = extra?.overrideKeys || [];
  for (const key of overrides) {
    const val = process.env[key];
    if (val && fs.existsSync(val)) return { cmd: val } as { cmd: string; args?: string[] };
  }

  const envUpper = command.toUpperCase();
  const direct = process.env[`${envUpper}_BIN`] || process.env[`MULTITERM_${envUpper}_BIN`];
  const candidates: string[] = [];
  if (direct) candidates.push(direct);

  const appdata = process.env.APPDATA;
  if (appdata) {
    candidates.push(path.join(appdata, 'npm', `${command}.cmd`));
    candidates.push(path.join(appdata, 'npm', `${command}.ps1`));
  }
  const user = process.env.USERPROFILE;
  if (user) {
    candidates.push(path.join(user, 'AppData', 'Roaming', 'npm', `${command}.cmd`));
    candidates.push(path.join(user, 'AppData', 'Roaming', 'npm', `${command}.ps1`));
  }
  const local = process.env.LOCALAPPDATA;
  if (local) {
    candidates.push(path.join(local, 'Programs', 'Claude', `${command}.exe`));
    candidates.push(path.join(local, 'Programs', 'Claude Code', `${command}.exe`));
    candidates.push(path.join(local, 'Programs', 'Claude', `${command}.cmd`));
    candidates.push(path.join(local, 'Programs', 'Claude Code', `${command}.cmd`));
  }
  const pf = process.env['ProgramFiles'];
  if (pf) {
    candidates.push(path.join(pf, 'nodejs', `${command}.cmd`));
    candidates.push(path.join(pf, 'nodejs', `${command}.ps1`));
    candidates.push(path.join(pf, 'nodejs', command));
  }
  const pf86 = process.env['ProgramFiles(x86)'];
  if (pf86) {
    candidates.push(path.join(pf86, 'nodejs', `${command}.cmd`));
    candidates.push(path.join(pf86, 'nodejs', `${command}.ps1`));
    candidates.push(path.join(pf86, 'nodejs', command));
  }
  if (extra?.extraCandidates) candidates.push(...extra.extraCandidates);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (!fs.existsSync(candidate)) continue;
    } catch { continue; }
    const ext = path.extname(candidate).toLowerCase();
    if (ext === '.ps1') {
      const ps = 'powershell.exe';
      return { cmd: ps, args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', candidate] };
    }
    return { cmd: candidate };
  }
  return null;
}

export function spawnProcess(
  cwd: string,
  argv?: string[],
  cols = 80,
  rows = 24,
): SpawnResult {
  const pty = tryNodePty();
  const usePty = !!pty;
  const shell = defaultShell();
  let cmd = argv?.[0] || shell.cmd;
  const args = argv ? argv.slice(1) : shell.args;

  if (os.platform() === 'win32') {
    const resolved = cmd === 'codex'
      ? resolveWindowsCli('codex', { overrideKeys: ['CODEX_BIN', 'MULTITERM_CODEX_BIN'] })
      : cmd === 'claude'
        ? resolveWindowsCli('claude', { overrideKeys: ['CLAUDE_BIN', 'MULTITERM_CLAUDE_BIN'] })
        : null;
    if (resolved) {
      cmd = resolved.cmd;
      if (resolved.args?.length) {
        (args as string[]).unshift(...resolved.args);
      }
    }
  }

  if (usePty) {
    try {
      const term = pty!.spawn(cmd, args, {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: process.env,
      });
      logger.info('spawn.pty', { cmd: sanitize(cmd), args: sanitize(args.join(' ')), cwd: sanitize(cwd) });
      return {
        pty: true,
        pid: term.pid,
        write: (d: Buffer | string) => term.write(typeof d === 'string' ? d : (d as Buffer).toString('utf8')),
        resize: (c: number, r: number) => {
          try { term.resize(c, r); } catch {}
        },
        kill: (signal?: NodeJS.Signals | number) => {
          try { term.kill(signal as any); } catch {}
        },
        onData: (cb) => term.onData((d: string) => cb(Buffer.from(d, 'utf8'))),
        onExit: (cb) => term.onExit(({ exitCode }: { exitCode: number }) => cb(exitCode)),
      };
    } catch (err) {
      logger.error('spawn.pty.fail', { cmd: sanitize(cmd), args: sanitize(args.join(' ')), cwd: sanitize(cwd), err: String(err) });
      // fall through to stdio spawn below
    }
  }

  const child: ChildProcessWithoutNullStreams = spawnChild(cmd, args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
  });
  logger.info('spawn.stdio', { cmd: sanitize(cmd), args: sanitize(args.join(' ')), cwd: sanitize(cwd) });

  return {
    pty: false,
    pid: child.pid,
    write: (d: Buffer | string) => child.stdin.write(d),
    kill: (signal?: NodeJS.Signals | number) => {
      try { child.kill(signal as any); } catch {}
    },
    onData: (cb) => {
      child.stdout.on('data', (d) => cb(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      child.stderr.on('data', (d) => cb(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    },
    onExit: (cb) => child.on('exit', (code) => cb(code)),
  };
}
