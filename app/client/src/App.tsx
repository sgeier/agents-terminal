import { useEffect, useMemo, useState } from 'react';
import { Projects } from '@/pages/Projects';
import { Dashboard } from '@/pages/Dashboard';
import type { Project, TerminalSession } from '@/types/domain';
import { api } from '@/lib/api';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mt.theme') as any) || 'dark');

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
    const saved = localStorage.getItem('mt.selectedProjectId');
    if (saved) setSelectedId(saved);
    api.listSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('mt.theme', theme);
  }, [theme]);

  function onSelect(id: string) {
    setSelectedId(id);
    localStorage.setItem('mt.selectedProjectId', id);
  }

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);

  async function spawnShell() {
    const s = await api.createSession({ projectId: selectedProject?.id, cwd: selectedProject?.cwd });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  async function spawnCodex() {
    const s = await api.createSession({ projectId: selectedProject?.id, cwd: selectedProject?.cwd, command: ['codex'] });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  return (
    <div>
      <div className="header">
        <div className="left">
          <strong>Agents Terminal</strong>
          <select value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn" onClick={() => setShowProjects((v) => !v)}>Projects…</button>
        </div>
        <div className="right">
          <button className="btn" onClick={spawnCodex}>Spawn</button>
          <button className="btn" onClick={spawnShell}>New Terminal</button>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>
      {showProjects && (
        <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
          <Projects onOpen={(p) => { setShowProjects(false); onSelect(p.id); setProjects((v) => [...v.filter(x => x.id !== p.id), p]); }} />
        </div>
      )}
      <Dashboard project={selectedProject} projects={projects} sessions={sessions} setSessions={setSessions} />
    </div>
  );
}
