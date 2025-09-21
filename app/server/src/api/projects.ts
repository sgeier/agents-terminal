import { Router } from 'express';
import { createStore } from '../core/store';
import { Project } from '../types/domain';
import { logger, sanitize } from '../core/log';

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

