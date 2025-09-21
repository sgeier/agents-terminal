"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.selftestRouter = selftestRouter;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const log_1 = require("../core/log");
const pty_1 = require("../core/pty");
const bus_1 = require("../core/bus");
function selftestRouter() {
    const r = (0, express_1.Router)();
    r.get('/readyz', async (req, res) => {
        const doSelf = String(req.query.selftest || '0') === '1';
        if (!doSelf)
            return res.json({ ok: true });
        // 1. Create temp project dir with .multiterm/project.json
        const tmp = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'multiterm-'));
        const mult = path_1.default.join(tmp, '.multiterm');
        fs_1.default.mkdirSync(mult, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(mult, 'project.json'), JSON.stringify({ id: 'self', name: 'self', cwd: tmp, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'Shell' }));
        const bus = (0, bus_1.createSessionBus)('selftest');
        const platform = os_1.default.platform();
        const cmd = platform === 'win32'
            ? ['powershell.exe', '-NoLogo', '-NoProfile', '-Command', 'Write-Output READY; Start-Sleep -Milliseconds 200; Write-Output OK']
            : ['/bin/bash', '-lc', 'echo READY; sleep 0.2; echo OK'];
        const proc = (0, pty_1.spawnProcess)(tmp, cmd);
        let sawReady = false;
        let sawOk = false;
        const t0 = Date.now();
        const frames = [];
        const done = new Promise((resolve) => {
            proc.onData((d) => {
                bus.push(d);
                const s = d.toString('utf8');
                frames.push(s);
                if (s.includes('READY'))
                    sawReady = true;
                if (s.includes('OK'))
                    sawOk = true;
                if (sawReady && sawOk)
                    resolve();
            });
            proc.onExit(() => resolve());
        });
        await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
        const dt = Date.now() - t0;
        try {
            proc.kill('SIGKILL');
        }
        catch { }
        fs_1.default.rmSync(tmp, { recursive: true, force: true });
        log_1.logger.info('selftest', { sawReady, sawOk, dt });
        res.json({ ok: sawReady && sawOk, ms: dt, sawReady, sawOk });
    });
    return r;
}
