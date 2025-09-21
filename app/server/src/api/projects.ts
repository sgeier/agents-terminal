import { Router } from 'express';
import { spawn } from 'child_process';
import os from 'os';
import { createStore } from '../core/store';
import { Project } from '../types/domain';
import { logger, sanitize } from '../core/log';
import { validateProjectCwd } from '../core/security';

// A singleton store for this process
const store = createStore();

export function getStore() {
  return store;
}

export function projectsRouter() {
  const r = Router();

  r.get('/', (req, res) => {
    const list = store.list();
    res.json(list);
  });

  r.post('/', (req, res) => {
    const { name, cwd, type, autostart } = req.body || {};
    if (!name || !cwd || !type) {
      return res.status(400).json({ error: 'name,cwd,type required' });
    }
    const proj: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      name: String(name),
      cwd: String(cwd),
      type: String(type) as any,
      autostart: !!autostart,
    };
    const created = store.create(proj);
    res.status(201).json(created);
  });

  r.post('/import', (req, res) => {
    const { cwd } = req.body || {};
    if (!cwd || typeof cwd !== 'string') return res.status(400).json({ error: 'cwd required' });
    const proj = store.importByCwd(cwd);
    if (!proj) return res.status(404).json({ error: 'not found' });
    res.json(proj);
  });

  // Open the project directory in Cursor editor (macOS preferred)
  r.post('/:id/open-cursor', (req, res) => {
    const id = req.params.id;
    const proj = store.get(id);
    if (!proj) return res.status(404).json({ error: 'not found' });
    if (!validateProjectCwd(store, proj.cwd)) return res.status(400).json({ error: 'invalid project cwd' });

    const cwd = proj.cwd;
    try {
      const platform = os.platform();
      let child;
      if (platform === 'darwin') {
        // Best-effort: use macOS open with Cursor app
        child = spawn('open', ['-a', 'Cursor', cwd], { stdio: 'ignore', detached: true });
      } else {
        // Fallback: try "cursor" CLI if present
        child = spawn('cursor', [cwd], { stdio: 'ignore', detached: true });
      }
      child.on('error', (e) => {
        logger.warn('cursor.open.failed', { id, cwd: sanitize(cwd), err: String(e) });
      });
      try { child.unref(); } catch {}
      logger.info('cursor.open', { id, cwd: sanitize(cwd) });
      return res.json({ ok: true });
    } catch (e) {
      logger.warn('cursor.open.exception', { id, cwd: sanitize(proj.cwd), err: String(e) });
      return res.status(500).json({ error: 'failed to launch cursor' });
    }
  });

  r.patch('/:id', (req, res) => {
    const id = req.params.id;
    const updated = store.update(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  r.delete('/:id', (req, res) => {
    const id = req.params.id;
    const ok = store.remove(id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  logger.info('api.projects.ready');
  return r;
}
