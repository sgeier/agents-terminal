import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Filter,
  Grid3X3 as GridIcon,
  LayoutList,
  Palette,
  Plus,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

export function Projects({ onOpen, onClose }: { onOpen: (project: Project) => void; onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Shell' | 'Codex' | 'Claude'>('All');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [cwd, setCwd] = useState<string>('');
  const [type, setType] = useState<'Shell' | 'Codex' | 'Claude'>('Shell');
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
    const claude = projects.filter((p) => p.type === 'Claude').length;
    const shell = projects.filter((p) => p.type === 'Shell').length;
    const last = projects.reduce((acc, p) => (p.updatedAt > acc ? p.updatedAt : acc), '');
    return { total, codex, claude, shell, last };
  }, [projects]);

  const create = async () => {
    if (!name || !cwd) return;
    const p = await api.createProject({ name, cwd, type });
    setProjects((v) => [...v, p]);
    setShowCreate(false);
    setPickerHint('');
    try {
      const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
      if (!cwds.includes(cwd)) cwds.push(cwd);
      localStorage.setItem('mt.cwds', JSON.stringify(cwds));
    } catch {}
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="All">All types</option>
            <option value="Shell">Shell</option>
            <option value="Codex">Codex</option>
            <option value="Claude">Claude</option>
          </select>
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <GridIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setView('list')}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showCreate ? 'secondary' : 'outline'}
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus className="h-4 w-4" /> {showCreate ? 'Cancel' : 'New Project'}
          </Button>
          <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={onClose}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="border border-dashed border-border/60 bg-card/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Create project</CardTitle>
            <CardDescription>Give it a name and absolute path. You can import metadata from .multiterm/project.json.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto]">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex flex-col gap-2">
                <Input placeholder="Absolute cwd" value={cwd} onChange={(e) => setCwd(e.target.value)} />
                <p className="text-xs text-muted-foreground">{pickerHint}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2" onClick={() => {
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
                }}
              >
                <Wrench className="h-4 w-4" /> Browse
              </Button>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                >
                  <option value="Shell">Shell</option>
                  <option value="Codex">Codex</option>
                  <option value="Claude">Claude</option>
                </select>
                <Button variant="secondary" size="sm" onClick={create}>
                  Create
                </Button>
              </div>
            </div>
            <input
              ref={dirInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              // @ts-ignore
              directory=""
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.currentTarget.files || []);
                if (!files.length) return;
                const projFile = files.find((f) => (f as any).webkitRelativePath?.includes('.multiterm/project.json'));
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
            <RecentCwds onPick={(c) => setCwd(c)} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        <MiniStat label="Total" value={stats.total} />
        <MiniStat label="Shell" value={stats.shell} />
        <MiniStat label="Codex" value={stats.codex} />
        <MiniStat label="Claude" value={stats.claude} />
        <MiniStat label="Last Updated" value={stats.last ? new Date(stats.last).toLocaleDateString() : '—'} />
      </div>

      <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border/60 bg-card/50">
        <div className="p-4">
          {filtered.length === 0 ? (
            <Card className="border border-dashed border-border/60 bg-card/70 text-center">
              <CardHeader>
                <CardTitle>No projects found</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Adjust your search or create a new project to get started.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  onOpen={() => onOpen(p)}
                  onChange={(updated) => setProjects((v) => v.map((x) => (x.id === p.id ? updated : x)))}
                  onDelete={() => setProjects((v) => v.filter((x) => x.id !== p.id))}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  onOpen={() => onOpen(p)}
                  onDelete={() => setProjects((v) => v.filter((x) => x.id !== p.id))}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border/50 bg-card/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function ProjectCard({ p, onOpen, onChange, onDelete }: { p: Project; onOpen: () => void; onChange: (updated: Project) => void; onDelete: () => void }) {
  const [showCustomize, setShowCustomize] = useState(false);
  const typeLabel = p.type === 'Codex' ? 'Codex' : p.type === 'Claude' ? 'Claude' : 'Shell';
  return (
    <Card className="flex h-full flex-col gap-4 border-border/60 bg-card/80">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold text-foreground">{p.name}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">{typeLabel}</CardDescription>
        </div>
        <Badge variant="secondary" className="bg-secondary/80 text-secondary-foreground">
          {p.type}
        </Badge>
      </CardHeader>
      <CardContent className="flex grow flex-col gap-4 pt-0">
        <p className="break-all text-xs text-muted-foreground">{p.cwd}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onOpen}>
            Open Project
          </Button>
          <Button
            size="sm"
            variant={showCustomize ? 'secondary' : 'outline'}
            className="flex items-center gap-2"
            onClick={() => setShowCustomize((v) => !v)}
          >
            <Palette className="h-4 w-4" /> Customize
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex items-center gap-2 text-destructive"
            onClick={() =>
              api
                .deleteProject(p.id)
                .then(() => {
                  try {
                    const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
                    localStorage.setItem('mt.cwds', JSON.stringify(cwds.filter((c) => c !== p.cwd)));
                  } catch {}
                  onDelete();
                })
            }
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
        {showCustomize && (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/60 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Palette className="h-4 w-4" /> Tile color
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={p.bgColor || '#1e293b'}
                onChange={async (e) => {
                  const updated = await api.updateProject(p.id, { bgColor: e.target.value || '' });
                  onChange(updated);
                  try { window.dispatchEvent(new CustomEvent('mt.project.updated', { detail: updated })); } catch {}
                }}
                className="h-10 w-16 cursor-pointer rounded-md border border-input bg-background"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const updated = await api.updateProject(p.id, { bgColor: '' });
                  onChange(updated);
                  try { window.dispatchEvent(new CustomEvent('mt.project.updated', { detail: updated })); } catch {}
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectRow({ p, onOpen, onDelete }: { p: Project; onOpen: () => void; onDelete: () => void }) {
  const typeLabel = p.type === 'Codex' ? 'Codex' : p.type === 'Claude' ? 'Claude' : 'Shell';
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">{typeLabel} • {p.cwd}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onOpen}>
          Open Project
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex items-center gap-2 text-destructive"
          onClick={() =>
            api
              .deleteProject(p.id)
              .then(() => {
                try {
                  const cwds: string[] = JSON.parse(localStorage.getItem('mt.cwds') || '[]');
                  localStorage.setItem('mt.cwds', JSON.stringify(cwds.filter((c) => c !== p.cwd)));
                } catch {}
                onDelete();
              })
          }
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
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
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="">Recent paths…</option>
      {items.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
