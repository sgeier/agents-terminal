import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Project } from '../types/domain';
import { logger, sanitize } from './log';

export interface Store {
  list(): Project[];
  create(p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project;
  update(id: string, patch: Partial<Project>): Project | undefined;
  remove(id: string): boolean;
  get(id: string): Project | undefined;
  isValidProjectDir(cwd: string): boolean;
}

const memory = new Map<string, Project>();

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function projectFile(cwd: string) {
  return path.join(cwd, '.multiterm', 'project.json');
}

export function createStore(): Store {
  return {
    list() {
      return [...memory.values()];
    },
    create(p) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const proj: Project = { id, createdAt: now, updatedAt: now, ...p };
      // persist to .multiterm
      const dir = path.join(p.cwd, '.multiterm');
      ensureDir(dir);
      fs.writeFileSync(projectFile(p.cwd), JSON.stringify(proj, null, 2));
      memory.set(id, proj);
      logger.info('project.create', { id, name: sanitize(p.name), cwd: sanitize(p.cwd) });
      return proj;
    },
    update(id, patch) {
      const cur = memory.get(id);
      if (!cur) return undefined;
      const next: Project = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      memory.set(id, next);
      try {
        fs.writeFileSync(projectFile(next.cwd), JSON.stringify(next, null, 2));
      } catch (e) {
        logger.warn('project.update.persist_failed', { id, err: String(e) });
      }
      return next;
    },
    remove(id) {
      const cur = memory.get(id);
      if (!cur) return false;
      memory.delete(id);
      try {
        fs.unlinkSync(projectFile(cur.cwd));
      } catch (e) {
        logger.warn('project.remove.unlink_failed', { id, err: String(e) });
      }
      logger.info('project.remove', { id });
      return true;
    },
    get(id) {
      return memory.get(id);
    },
    isValidProjectDir(cwd: string) {
      try {
        const f = projectFile(cwd);
        if (!fs.existsSync(f)) return false;
        const data = JSON.parse(fs.readFileSync(f, 'utf8')) as Project;
        return typeof data?.id === 'string' && typeof data?.name === 'string';
      } catch {
        return false;
      }
    },
  };
}

