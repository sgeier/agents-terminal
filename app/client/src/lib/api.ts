import type { Project, TerminalSession, OutputFrame, InputChunk } from '@/types/domain';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => fetch(`${API_BASE}/api/projects`).then(json<Project[]>),
  createProject: (body: Partial<Project>) => fetch(`${API_BASE}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json<Project>),
  importProject: (cwd: string) => fetch(`${API_BASE}/api/projects/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }),
  }).then(json<Project>),
  updateProject: (id: string, patch: Partial<Project>) => fetch(`${API_BASE}/api/projects/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }).then(json<Project>),
  deleteProject: (id: string) => fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' }).then(json<{ ok: boolean }>),

  // Sessions
  listSessions: () => fetch(`${API_BASE}/api/sessions`).then(json<TerminalSession[]>),
  getSession: (id: string) => fetch(`${API_BASE}/api/sessions/${id}`).then(json<TerminalSession>),
  createSession: (body: { projectId?: string; cwd?: string; command?: string[] }) => fetch(`${API_BASE}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json<TerminalSession>),
  stopSession: (id: string) => fetch(`${API_BASE}/api/sessions/${id}/stop`, { method: 'POST' }).then(json<{ ok: boolean }>),
  deleteSession: (id: string) => fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' }).then(json<{ ok: boolean }>),
  resize: (id: string, cols: number, rows: number) => fetch(`${API_BASE}/api/sessions/${id}/resize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cols, rows }),
  }).then(json<{ ok: boolean }>),
  scrollback: (id: string, from: number) => fetch(`${API_BASE}/api/sessions/${id}/scrollback?from=${from}`).then(json<{ from: number; to: number; frames: OutputFrame[] }>),
  input: (id: string, chunk: InputChunk) => fetch(`${API_BASE}/api/sessions/${id}/input`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chunk),
  }).then(json<{ ok: boolean }>),

  // Metrics removed
};

export function wsUrl(path: string) {
  const base = API_BASE.replace(/^http/, 'ws');
  return base + path;
}
