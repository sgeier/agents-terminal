import os from 'os';
import path from 'path';
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
    const pty = require('node-pty') as typeof import('node-pty');
    return pty;
  } catch (e) {
    logger.warn('pty.unavailable', { err: String(e) });
    return undefined;
  }
}

export function defaultShell(): { cmd: string; args: string[] } {
  const platform = os.platform();
  if (platform === 'win32') {
    const cmd = process.env.ComSpec || 'powershell.exe';
    if (cmd.toLowerCase().includes('powershell')) {
      return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] };
    }
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

export function spawnProcess(
  cwd: string,
  argv?: string[],
  cols = 80,
  rows = 24,
): SpawnResult {
  const pty = tryNodePty();
  const usePty = !!pty;
  const shell = defaultShell();
  const cmd = argv?.[0] || shell.cmd;
  const args = argv ? argv.slice(1) : shell.args;

  if (usePty) {
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
