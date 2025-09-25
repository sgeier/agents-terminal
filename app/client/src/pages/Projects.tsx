import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types/domain';

export function Projects({ onOpen, onClose }: { onOpen: (project: Project) => void; onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Shell' | 'Codex'>('All');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState<string>('');
  const [type, setType] = useState<'Shell' | 'Codex'>('Shell');
  const [pickerHint, setPickerHint] = useState<string>('');
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (filterType !== 'All') list = list.filter((p) => p.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.cwd.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [projects, search, filterType]);

  const stats = useMemo(() => {
    const total = projects.length;
    const codex = projects.filter((p) => p.type === 'Codex').length;
    const shell = projects.filter((p) => p.type === 'Shell').length;
    const last = projects.reduce((acc, p) => (p.updatedAt > acc ? p.updatedAt : acc), '');
    return { total, codex, shell, last };
  }, [projects]);

  const create = async () => {
    if (!name || !cwd) return;
    const p = await api.createProject({ name, cwd, type });
    setProjects((v) => [...v, p]);
    setShowCreate(false);
    try {
      const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
      if (!cwds.includes(cwd)) cwds.push(cwd);
      localStorage.setItem('mt.cwds', JSON.stringify(cwds));
    } catch {}
  };

  return (
    <div className="projects projects-theme">
      <div className="projects-toolbar">
        <div className="projects-controls">
          <div className="search">
            <span>🔍</span>
            <input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="chip" title="Filter by type">
            <span>⎇</span>
            <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
              <option value="All">All</option>
              <option value="Shell">Shell</option>
              <option value="Codex">Agent</option>
            </select>
          </span>
          <div className="view-toggle">
            <button className={`icon-btn${view === 'grid' ? ' active' : ''}`} title="Grid view" onClick={() => setView('grid')}>▦</button>
            <button className={`icon-btn${view === 'list' ? ' active' : ''}`} title="List view" onClick={() => setView('list')}>≣</button>
          </div>
        </div>
        <div className="projects-actions">
          <button className="btn" onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : '+ New Project'}</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>

      {showCreate && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto 1fr auto', gap: 8, alignItems: 'center' }}>
            <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ flex: 1 }} placeholder="cwd (abs)" value={cwd} onChange={(e) => setCwd(e.target.value)} />
              <button className="btn" onClick={() => {
                if ('showDirectoryPicker' in window) {
                  (window as any).showDirectoryPicker().then(async (handle: any) => {
                    try {
                      const mt = await handle.getDirectoryHandle('.multiterm', { create: false }).catch(() => null);
                      if (mt) {
                        const pj = await mt.getFileHandle('project.json', { create: false }).catch(() => null);
                        if (pj) {
                          const f = await pj.getFile();
                          const data = JSON.parse(await f.text());
                          if (data?.cwd) setCwd(data.cwd);
                          if (data?.name) setName(data.name);
                          setPickerHint('Imported from .multiterm/project.json');
                          return;
                        }
                      }
                      setName(handle.name || name);
                      setPickerHint('Selected folder. Paste absolute path to confirm.');
                    } catch {
                      setPickerHint('Folder selection failed.');
                    }
                  }).catch(() => { dirInputRef.current?.click(); });
                } else {
                  dirInputRef.current?.click();
                }
              }}>Browse…</button>
              <input
                ref={dirInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                // @ts-ignore
                directory=""
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = Array.from(e.currentTarget.files || []);
                  if (!files.length) return;
                  const projFile = files.find(f => (f as any).webkitRelativePath?.includes('.multiterm/project.json'));
                  if (projFile) {
                    try {
                      const data = JSON.parse(await projFile.text());
                      if (data?.cwd) setCwd(data.cwd);
                      if (data?.name) setName(data.name);
                      setPickerHint('Imported from .multiterm/project.json');
                      return;
                    } catch {}
                  }
                  const rel = (files[0] as any).webkitRelativePath || '';
                  const root = rel.split('/')[0] || '';
                  if (root) setName(root);
                  setPickerHint('Selected folder. Paste absolute path to confirm.');
                }}
              />
            </div>
            <span className="select-wrap">
              <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="Shell">Shell</option>
                <option value="Codex">Agent</option>
              </select>
            </span>
            <button className="btn" onClick={create}>Add</button>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{pickerHint}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <RecentCwds onPick={(c) => setCwd(c)} />
          </div>
        </div>
      )}

      <div className="projects-body">
        <div className="stats-grid">
          <div className="stat"><div className="k">Total Projects <span>📁</span></div><div className="v">{stats.total}</div></div>
          <div className="stat"><div className="k">Shell <span>⚡</span></div><div className="v">{stats.shell}</div></div>
          <div className="stat"><div className="k">Agents <span>🤖</span></div><div className="v">{stats.codex}</div></div>
          <div className="stat"><div className="k">Last Updated <span>🛠️</span></div><div className="v" style={{ fontSize: 16 }}>{stats.last ? new Date(stats.last).toLocaleString() : '—'}</div></div>
        </div>

        {view === 'grid' ? (
          <div className="project-grid">
            {filtered.map((p) => (
              <ProjectCard key={p.id} p={p} onOpen={() => onOpen(p)} onChange={(u) => setProjects((v) => v.map((x) => (x.id === p.id ? u : x)))} onDelete={() => setProjects((v) => v.filter((x) => x.id !== p.id))} />
            ))}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((p) => (
              <ProjectRow key={p.id} p={p} onOpen={() => onOpen(p)} onChange={(u) => setProjects((v) => v.map((x) => (x.id === p.id ? u : x)))} onDelete={() => setProjects((v) => v.filter((x) => x.id !== p.id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ p, onOpen, onChange, onDelete }: { p: Project; onOpen: () => void; onChange: (updated: Project) => void; onDelete: () => void }) {
  const [showCustomize, setShowCustomize] = useState(false);
  const typeLabel = p.type === 'Codex' ? 'Agent' : 'Shell';
  return (
    <div className="project-card">
      <div className="project-top">
        <div className="project-meta">
          <div className="project-name">{p.name}</div>
          <div className="muted project-sub">{typeLabel}</div>
        </div>
        <div className="project-actions">
          <button className="btn" onClick={onOpen}>Open Project</button>
          <button className="btn" onClick={() => setShowCustomize((v) => !v)}>{showCustomize ? 'Done' : 'Customize'}</button>
          <button className="btn" onClick={() => api.deleteProject(p.id).then(() => { try { const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]'); localStorage.setItem('mt.cwds', JSON.stringify(cwds.filter((c) => c !== p.cwd))); } catch {} onDelete(); })}>Delete</button>
        </div>
      </div>
      <div className="muted project-path">{p.cwd}</div>
      {showCustomize && (
        <div className="card project-customize">
          <div className="customize-row">
            <span className="muted">Tile color</span>
            <input
              type="color"
              value={p.bgColor || '#000000'}
              onChange={async (e) => {
                const updated = await api.updateProject(p.id, { bgColor: e.target.value || '' });
                onChange(updated);
                try { window.dispatchEvent(new CustomEvent('mt.project.updated', { detail: updated })); } catch {}
              }}
            />
            <button className="btn" onClick={async () => {
              const updated = await api.updateProject(p.id, { bgColor: '' });
              onChange(updated);
              try { window.dispatchEvent(new CustomEvent('mt.project.updated', { detail: updated })); } catch {}
            }}>Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ p, onOpen, onChange, onDelete }: { p: Project; onOpen: () => void; onChange: (updated: Project) => void; onDelete: () => void }) {
  const typeLabel = p.type === 'Codex' ? 'Agent' : 'Shell';
  return (
    <div className="project-row">
      <div><strong>{p.name}</strong> <span className="muted">· {typeLabel}</span></div>
      <div className="muted project-path">{p.cwd}</div>
      <button className="btn" onClick={onOpen}>Open Project</button>
      <button className="btn" onClick={() => api.deleteProject(p.id).then(() => { try { const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]'); localStorage.setItem('mt.cwds', JSON.stringify(cwds.filter((c) => c !== p.cwd))); } catch {} onDelete(); })}>Delete</button>
    </div>
  );
}

function RecentCwds({ onPick }: { onPick: (cwd: string) => void }) {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem('mt.cwds') || '[]'));
    } catch {}
  }, []);
  if (!items.length) return null;
  return (
    <span className="select-wrap">
      <select className="select" onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">Recent paths…</option>
        {items.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </span>
  );
}
