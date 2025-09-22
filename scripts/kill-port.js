#!/usr/bin/env node
// Kill any process bound to the given TCP port. Best-effort, cross-platform.
// Usage: node scripts/kill-port.js [port]

const { execSync, spawnSync } = require('child_process');

function log(msg) {
  process.stdout.write(`[kill-port] ${msg}\n`);
}

const port = Number(process.argv[2] || process.env.PORT || 3001);
if (!Number.isFinite(port)) {
  console.error('Invalid port');
  process.exit(2);
}

function unique(arr) { return Array.from(new Set(arr)); }

function killPid(pid) {
  if (!pid) return;
  try { process.kill(pid, 'SIGTERM'); } catch {}
  // Give it a moment
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

function onDarwinLinux() {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const pids = unique(out.split(/\s+/).map(s => s.trim()).filter(Boolean));
    if (!pids.length) return false;
    log(`Killing ${pids.length} pid(s) on port ${port}…`);
    for (const p of pids) killPid(Number(p));
    return true;
  } catch { return false; }
}

function onWindows() {
  try {
    const res = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    if (res.status !== 0) return false;
    const lines = res.stdout.split(/\r?\n/);
    const pids = [];
    for (const line of lines) {
      // Proto  Local Address          Foreign Address        State           PID
      // TCP    0.0.0.0:3100          0.0.0.0:0              LISTENING       12345
      if (!/LISTENING/.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const local = parts[1];
      if (local.endsWith(':'+port)) pids.push(Number(parts[4]));
    }
    const uniq = unique(pids.filter(Boolean));
    if (!uniq.length) return false;
    log(`Killing ${uniq.length} pid(s) on port ${port}…`);
    for (const p of uniq) {
      try { execSync(`taskkill /F /PID ${p}`); } catch {}
    }
    return true;
  } catch { return false; }
}

const platform = process.platform;
let killed = false;
if (platform === 'darwin' || platform === 'linux') killed = onDarwinLinux();
else if (platform === 'win32') killed = onWindows();

if (killed) log(`Port ${port} cleared.`);
process.exit(0);

