"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStore = getStore;
exports.projectsRouter = projectsRouter;
const express_1 = require("express");
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const store_1 = require("../core/store");
const log_1 = require("../core/log");
const security_1 = require("../core/security");
// A singleton store for this process
const store = (0, store_1.createStore)();
function getStore() {
    return store;
}
function projectsRouter() {
    const r = (0, express_1.Router)();
    r.get('/', (req, res) => {
        const list = store.list();
        res.json(list);
    });
    r.post('/', (req, res) => {
        const { name, cwd, type, autostart } = req.body || {};
        if (!name || !cwd || !type) {
            return res.status(400).json({ error: 'name,cwd,type required' });
        }
        const proj = {
            name: String(name),
            cwd: String(cwd),
            type: String(type),
            autostart: !!autostart,
        };
        const created = store.create(proj);
        res.status(201).json(created);
    });
    r.post('/import', (req, res) => {
        const { cwd } = req.body || {};
        if (!cwd || typeof cwd !== 'string')
            return res.status(400).json({ error: 'cwd required' });
        const proj = store.importByCwd(cwd);
        if (!proj)
            return res.status(404).json({ error: 'not found' });
        res.json(proj);
    });
    // Open the project directory in Cursor editor (macOS preferred)
    r.post('/:id/open-cursor', (req, res) => {
        const id = req.params.id;
        const proj = store.get(id);
        if (!proj)
            return res.status(404).json({ error: 'not found' });
        if (!(0, security_1.validateProjectCwd)(store, proj.cwd))
            return res.status(400).json({ error: 'invalid project cwd' });
        const cwd = proj.cwd;
        try {
            const platform = os_1.default.platform();
            let child;
            if (platform === 'darwin') {
                // Best-effort: use macOS open with Cursor app
                child = (0, child_process_1.spawn)('open', ['-a', 'Cursor', cwd], { stdio: 'ignore', detached: true });
            }
            else {
                // Fallback: try "cursor" CLI if present
                child = (0, child_process_1.spawn)('cursor', [cwd], { stdio: 'ignore', detached: true });
            }
            child.on('error', (e) => {
                log_1.logger.warn('cursor.open.failed', { id, cwd: (0, log_1.sanitize)(cwd), err: String(e) });
            });
            try {
                child.unref();
            }
            catch { }
            log_1.logger.info('cursor.open', { id, cwd: (0, log_1.sanitize)(cwd) });
            return res.json({ ok: true });
        }
        catch (e) {
            log_1.logger.warn('cursor.open.exception', { id, cwd: (0, log_1.sanitize)(proj.cwd), err: String(e) });
            return res.status(500).json({ error: 'failed to launch cursor' });
        }
    });
    r.patch('/:id', (req, res) => {
        const id = req.params.id;
        const updated = store.update(id, req.body || {});
        if (!updated)
            return res.status(404).json({ error: 'not found' });
        res.json(updated);
    });
    r.delete('/:id', (req, res) => {
        const id = req.params.id;
        const ok = store.remove(id);
        if (!ok)
            return res.status(404).json({ error: 'not found' });
        res.json({ ok: true });
    });
    log_1.logger.info('api.projects.ready');
    return r;
}
