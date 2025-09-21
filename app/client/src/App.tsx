import { useEffect, useMemo, useState } from 'react';
import { Projects } from '@/pages/Projects';
import { Dashboard } from '@/pages/Dashboard';
import type { Project, TerminalSession } from '@/types/domain';
import { api } from '@/lib/api';
import { Modal } from '@/components/Modal';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mt.theme') as any) || 'dark');
  const [sync, setSync] = useState<boolean>(() => localStorage.getItem('mt.sync') === '1');
  const seqBySessionRef = useState<Map<string, number>>(new Map())[0];

  useEffect(() => {
    async function loadProjects() {
      try {
        let list = await api.listProjects();
        // Import from localStorage at startup so select is populated even after server restarts
        try {
          const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
          const known = new Set(list.map((p) => p.cwd));
          const imports: Project[] = [];
          for (const c of cwds) {
            if (!known.has(c)) {
              try { imports.push(await api.importProject(c)); } catch {}
            }
          }
          if (imports.length) list = [...list, ...imports];
        } catch {}
        // Dedupe by id
        const map = new Map<string, Project>(list.map((p) => [p.id, p]));
        const merged = [...map.values()];
        setProjects(merged);
        if (!selectedId && merged.length) setSelectedId(merged[0].id);
      } catch {}
    }
    loadProjects();
    const saved = localStorage.getItem('mt.selectedProjectId');
    if (saved) setSelectedId(saved);
    api.listSessions().then(setSessions).catch(() => {});
  }, []);

  // Periodically refresh session metadata to reflect exits quickly
  useEffect(() => {
    const t = setInterval(() => {
      api.listSessions().then((list) => {
        setSessions((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const s of list) map.set(s.id, { ...(map.get(s.id) || s), ...s });
          return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        });
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(t);
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

  async function broadcastInput(fromId: string, bytes: Uint8Array) {
    if (!sync) return;
    const targets = sessions.filter((s) => s.id !== fromId);
    const b64 = btoa(String.fromCharCode(...bytes));
    await Promise.all(targets.map((t) => {
      const seq = (seqBySessionRef.get(t.id) || 0) + 1;
      seqBySessionRef.set(t.id, seq);
      return api.input(t.id, { sessionId: t.id, seq, dataBase64: b64 });
    })).catch(() => {});
  }

  return (
    <div>
      <div className="header">
        <div className="left">
          <strong>Agents Terminal</strong>
          <span className="select-wrap">
            <select className="select" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </span>
          <button className="btn" onClick={spawnCodex}>Spawn</button>
          <button className="btn" onClick={spawnShell}>New Terminal</button>
        </div>
        <div className="right">
          <button className="btn" onClick={() => setShowProjects(true)}>Projects…</button>
          <button className="btn" onClick={() => { const v = !sync; setSync(v); localStorage.setItem('mt.sync', v ? '1' : '0'); }}>Sync: {sync ? 'On' : 'Off'}</button>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>
      <Modal title="Projects" open={showProjects} onClose={() => setShowProjects(false)}>
        <Projects onOpen={(p) => { setShowProjects(false); onSelect(p.id); setProjects((v) => [...v.filter(x => x.id !== p.id), p]); }} />
      </Modal>
      <Dashboard project={selectedProject} projects={projects} sessions={sessions} setSessions={setSessions} sync={sync} onBroadcast={broadcastInput} />
    </div>
  );
}
