import { useEffect, useState } from 'react';
import { Projects } from '@/pages/Projects';
import { Dashboard } from '@/pages/Dashboard';
import type { Project } from '@/types/domain';
import { api } from '@/lib/api';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
    const saved = localStorage.getItem('mt.selectedProjectId');
    if (saved) setSelectedId(saved);
  }, []);

  function onSelect(id: string) {
    setSelectedId(id);
    localStorage.setItem('mt.selectedProjectId', id);
  }

  return (
    <div>
      <div className="header">
        <strong>Agents Terminal</strong>
        <select value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn" onClick={() => setShowProjects((v) => !v)}>Projects…</button>
      </div>
      {showProjects && (
        <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
          <Projects onOpen={(p) => { setShowProjects(false); onSelect(p.id); setProjects((v) => [...v.filter(x => x.id !== p.id), p]); }} />
        </div>
      )}
      <Dashboard project={projects.find((p) => p.id === selectedId) || null} projects={projects} />
    </div>
  );
}
