import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types/domain';

export function Projects({ onOpen }: { onOpen: (project: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('demo');
  const [cwd, setCwd] = useState<string>('');
  const [type, setType] = useState<'Shell' | 'Codex'>('Shell');

  useEffect(() => {
    api.listProjects().then(async (list) => {
      setProjects(list);
      // Import from localStorage (persisted cwds)
      const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
      const known = new Set(list.map((p) => p.cwd));
      for (const c of cwds) {
        if (!known.has(c)) {
          try {
            const p = await api.importProject(c);
            setProjects((v) => [...v, p]);
          } catch {}
        }
      }
    }).catch(() => {});
  }, []);

  const create = async () => {
    const p = await api.createProject({ name, cwd, type });
    setProjects((v) => [...v, p]);
    try {
      const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
      if (!cwds.includes(cwd)) cwds.push(cwd);
      localStorage.setItem('mt.cwds', JSON.stringify(cwds));
    } catch {}
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
            <button className="btn" onClick={() => api.deleteProject(p.id).then(() => {
              setProjects((v) => v.filter((x) => x.id !== p.id));
              try {
                const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
                localStorage.setItem('mt.cwds', JSON.stringify(cwds.filter((c) => c !== p.cwd)));
              } catch {}
            })}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
