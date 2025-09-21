import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types/domain';

export function Projects({ onOpen }: { onOpen: (project: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('demo');
  const [cwd, setCwd] = useState<string>('');
  const [type, setType] = useState<'Shell' | 'Codex'>('Shell');
  const [pickerHint, setPickerHint] = useState<string>('');
  const dirInputRef = useRef<HTMLInputElement | null>(null);

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto 1fr auto', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} placeholder="cwd (abs)" value={cwd} onChange={(e) => setCwd(e.target.value)} />
          <button className="btn" onClick={() => {
            // Prefer FS Access API when available; otherwise use hidden input fallback
            // Note: Browsers do not expose absolute paths; we try to import from .multiterm if present
            if ('showDirectoryPicker' in window) {
              (window as any).showDirectoryPicker().then(async (handle: any) => {
                try {
                  // Try to find an existing .multiterm/project.json to infer absolute cwd
                  const mt = await handle.getDirectoryHandle('.multiterm', { create: false }).catch(() => null);
                  if (mt) {
                    const pj = await mt.getFileHandle('project.json', { create: false }).catch(() => null);
                    if (pj) {
                      const f = await pj.getFile();
                      const data = JSON.parse(await f.text());
                      if (data?.cwd) {
                        setCwd(data.cwd);
                      }
                      if (data?.name) setName(data.name);
                      setPickerHint('Imported from .multiterm/project.json');
                      return;
                    }
                  }
                  // No metadata; we can only set the folder name as a hint
                  setName(handle.name || name);
                  setPickerHint('Selected folder. Paste absolute path to confirm.');
                } catch (err) {
                  setPickerHint('Folder selection failed.');
                }
              }).catch(() => {
                // Fall back to hidden input if user cancels or API not permitted
                dirInputRef.current?.click();
              });
            } else {
              dirInputRef.current?.click();
            }
          }}>Browse…</button>
          <input
            ref={dirInputRef}
            type="file"
            // @ts-ignore non-standard attributes used by Chromium
            webkitdirectory=""
            // @ts-ignore non-standard attributes used by Chromium
            directory=""
            style={{ display: 'none' }}
            onChange={async (e) => {
              const files = Array.from(e.currentTarget.files || []);
              if (!files.length) return;
              // Try to locate .multiterm/project.json among selected files to recover absolute cwd
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
              // Fallback: infer root folder name from first file's relative path
              const rel = (files[0] as any).webkitRelativePath || '';
              const root = rel.split('/')[0] || '';
              if (root) setName(root);
              setPickerHint('Selected folder. Paste absolute path to confirm.');
            }}
          />
        </div>
        <span className="select-wrap">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option>Shell</option>
            <option>Codex</option>
          </select>
        </span>
        <button className="btn" onClick={create}>Add</button>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{pickerHint}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <RecentCwds onPick={(c) => setCwd(c)} />
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
