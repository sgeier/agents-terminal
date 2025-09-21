"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStore = getStore;
exports.projectsRouter = projectsRouter;
const express_1 = require("express");
const store_1 = require("../core/store");
const log_1 = require("../core/log");
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
