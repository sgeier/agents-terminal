import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types/domain';

export function Projects({ onOpen }: { onOpen: (project: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('demo');
  const [cwd, setCwd] = useState<string>('');
  const [type, setType] = useState<'Shell' | 'Codex'>('Shell');

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  const create = async () => {
    const p = await api.createProject({ name, cwd, type });
    setProjects((v) => [...v, p]);
  };

  return (
    <div>
      <div className="header">
        <strong>Projects</strong>
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="cwd (abs)" value={cwd} onChange={(e) => setCwd(e.target.value)} style={{ width: 300 }} />
        <select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option>Shell</option>
          <option>Codex</option>
        </select>
        <button className="btn" onClick={create}>Add</button>
      </div>
      <div style={{ padding: 12 }}>
        {projects.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderBottom: '1px solid #eee' }}>
            <div style={{ flex: 1 }}>
              <div><strong>{p.name}</strong> <small>({p.type})</small></div>
              <div style={{ color: '#6b7280' }}>{p.cwd}</div>
            </div>
            <button className="btn" onClick={() => onOpen(p)}>Open</button>
            <button className="btn" onClick={() => api.deleteProject(p.id).then(() => setProjects((v) => v.filter((x) => x.id !== p.id)))}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

