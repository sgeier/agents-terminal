import path from 'path';
import { Store } from './store';

export function validateProjectCwd(store: Store, cwd: string): boolean {
  // must have .multiterm/project.json and be absolute path
  if (!path.isAbsolute(cwd)) return false;
  return store.isValidProjectDir(cwd);
}

export function isValidArgv(argv: unknown): argv is string[] {
  return Array.isArray(argv) && argv.every((x) => typeof x === 'string');
}

