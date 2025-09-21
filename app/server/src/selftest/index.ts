import fs from 'fs';
import os from 'os';
import path from 'path';
import { Router } from 'express';
import { createStore } from '../core/store';
import { defaultShell } from '../core/pty';
import { logger } from '../core/log';
import { spawnProcess } from '../core/pty';
import { createSessionBus } from '../core/bus';

export function selftestRouter() {
  const r = Router();

  r.get('/readyz', async (req, res) => {
    const doSelf = String(req.query.selftest || '0') === '1';
    if (!doSelf) return res.json({ ok: true });

    // 1. Create temp project dir with .multiterm/project.json
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'multiterm-'));
    const mult = path.join(tmp, '.multiterm');
    fs.mkdirSync(mult, { recursive: true });
    fs.writeFileSync(path.join(mult, 'project.json'), JSON.stringify({ id: 'self', name: 'self', cwd: tmp, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'Shell' }));

    const bus = createSessionBus('selftest');
    const platform = os.platform();
    const cmd = platform === 'win32'
      ? ['powershell.exe', '-NoLogo', '-NoProfile', '-Command', 'Write-Output READY; Start-Sleep -Milliseconds 200; Write-Output OK']
      : ['/bin/bash', '-lc', 'echo READY; sleep 0.2; echo OK'];

    const proc = spawnProcess(tmp, cmd);
    let sawReady = false;
    let sawOk = false;
    const t0 = Date.now();
    const frames: string[] = [];

    const done = new Promise<void>((resolve) => {
      proc.onData((d) => {
        bus.push(d);
        const s = d.toString('utf8');
        frames.push(s);
        if (s.includes('READY')) sawReady = true;
        if (s.includes('OK')) sawOk = true;
        if (sawReady && sawOk) resolve();
      });
      proc.onExit(() => resolve());
    });

    await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
    const dt = Date.now() - t0;
    try { proc.kill('SIGKILL'); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });

    logger.info('selftest', { sawReady, sawOk, dt });
    res.json({ ok: sawReady && sawOk, ms: dt, sawReady, sawOk });
  });

  return r;
}

