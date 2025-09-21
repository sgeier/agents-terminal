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
    try {
      const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
      if (!cwds.includes(cwd)) cwds.push(cwd);
      localStorage.setItem('mt.cwds', JSON.stringify(cwds));
    } catch {}
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: 8, marginBottom: 12 }}>
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="cwd (abs)" value={cwd} onChange={(e) => setCwd(e.target.value)} />
        <span className="select-wrap">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option>Shell</option>
            <option>Codex</option>
          </select>
        </span>
        <button className="btn" onClick={create}>Add</button>
      </div>
      <div>
        {projects.map((p) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div><strong>{p.name}</strong> <small style={{ color: 'var(--muted)' }}>({p.type})</small></div>
            <div style={{ color: 'var(--muted)' }}>{p.cwd}</div>
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
