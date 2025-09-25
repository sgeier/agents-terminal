import { useEffect, useMemo, useRef, useState } from 'react';
import { Projects } from '@/pages/Projects';
import { Dashboard } from '@/pages/Dashboard';
import type { Project, TerminalSession } from '@/types/domain';
import { api } from '@/lib/api';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AudioLines,
  FolderOpen,
  Grid3x3,
  History,
  Moon,
  Scan,
  Share2,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Wifi,
} from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mt.theme') as any) || 'dark');
  const [sync, setSync] = useState<boolean>(() => localStorage.getItem('mt.sync') === '1');
  const [voice, setVoice] = useState<boolean>(() => localStorage.getItem('mt.voice') !== '0');
  const seqBySessionRef = useState<Map<string, number>>(new Map())[0];
  // Align grid broadcast: when tick increments, tiles apply span/height
  const [alignTick, setAlignTick] = useState(0);
  const [alignTarget, setAlignTarget] = useState<{ span: number; height: number } | null>(null);
  // Quick spawn config toggles (persisted globally)
  const [cfgModel, setCfgModel] = useState<string>(() => localStorage.getItem('mt.cfg.model') || '');
  const [cfgApproval, setCfgApproval] = useState<string>(() => localStorage.getItem('mt.cfg.approval') || '');
  const [cfgSandbox, setCfgSandbox] = useState<string>(() => localStorage.getItem('mt.cfg.sandbox') || '');
  const [cfgWsNet, setCfgWsNet] = useState<boolean>(() => localStorage.getItem('mt.cfg.wsnet') === '1');
  const headerRef = useRef<HTMLDivElement | null>(null);

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

  // Listen for project updates from the Projects modal and merge into local list
  useEffect(() => {
    const onProjUpdate = (e: Event) => {
      const p = (e as CustomEvent).detail as Project | undefined;
      if (!p) return;
      setProjects((list) => {
        const map = new Map(list.map((x) => [x.id, x]));
        map.set(p.id, p);
        return [...map.values()];
      });
    };
    window.addEventListener('mt.project.updated', onProjUpdate as any);
    return () => window.removeEventListener('mt.project.updated', onProjUpdate as any);
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

  // Build Codex argv using direct CLI flags (-m, -a, -s, -c) per `codex --help`
  function buildCodexArgsDirect(base: string[] = []) {
    const args: string[][] = [];
    if (cfgModel) args.push(['-m', cfgModel]);
    if (cfgApproval) args.push(['-a', cfgApproval]);
    if (cfgSandbox) args.push(['-s', cfgSandbox]);
    if (cfgSandbox === 'workspace-write' && cfgWsNet) args.push(['-c', 'sandbox_workspace_write.network_access=true']);
    return [...base, ...args.flat()];
  }

  function buildCodexArgs(base: string[] = []) {
    const args: string[][] = [];
    if (cfgModel) args.push(['--model', cfgModel]);
    if (cfgApproval) args.push(['--config', `approval_policy="${cfgApproval}"`]);
    if (cfgSandbox) args.push(['--config', `sandbox_mode="${cfgSandbox}"`]);
    if (cfgSandbox === 'workspace-write' && cfgWsNet) args.push(['--config', 'sandbox_workspace_write.network_access=true']);
    return [...base, ...args.flat()];
  }

  async function spawnShell() {
    const s = await api.createSession({ projectId: selectedProject?.id, cwd: selectedProject?.cwd });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  async function spawnCodex() {
    const s = await api.createSession({ projectId: selectedProject?.id, cwd: selectedProject?.cwd, command: buildCodexArgsDirect(['codex']) });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  async function spawnCodexResumeLatest() {
    const s = await api.createSession({
      projectId: selectedProject?.id,
      cwd: selectedProject?.cwd,
      command: buildCodexArgsDirect(['codex', 'resume', '--last']),
    });
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

  function alignGrid(mode: 'auto' | 'compact' | 'comfortable' = 'auto') {
    const count = sessions.length || 1;
    let span = 12;
    let height = 320;
    if (mode === 'compact') {
      // More tiles per row, shorter height
      span = count >= 4 ? 3 : count === 3 ? 4 : count === 2 ? 6 : 12;
      height = 240;
    } else if (mode === 'comfortable') {
      // Fewer tiles per row, taller height
      span = count >= 6 ? 4 : count >= 3 ? 6 : count === 2 ? 6 : 12;
      height = 380;
    } else {
      // auto heuristic
      span = count >= 9 ? 3 : count >= 5 ? 4 : count >= 3 ? 6 : count === 2 ? 6 : 12;
      height = 320;
    }
    setAlignTarget({ span, height });
    setAlignTick((t) => t + 1);
  }

  // Fill page height: compute available height and rows, keep current spans
  function alignFillHeight() {
    const headerEl = headerRef.current;
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 64;
    const gridPaddingY = 32;
    const gapY = 16;
    const available = Math.max(180, Math.floor(window.innerHeight - headerH - gridPaddingY));
    // Estimate rows based on current per-project spans from localStorage
    let rows = 1;
    let cur = 0;
    for (const s of sessions) {
      const key = `mt.${s.projectId}.span`;
      let sp = 4;
      try {
        const raw = localStorage.getItem(key);
        const n = raw ? Number(raw) : NaN;
        sp = Number.isFinite(n) ? Math.min(12, Math.max(3, n)) : 4;
      } catch {}
      if (cur + sp > 12) { rows++; cur = 0; }
      cur += sp;
    }
    const totalGaps = (rows - 1) * gapY;
    const perRow = Math.max(180, Math.floor((available - totalGaps) / rows));
    // span: 0 -> preserve existing; height -> per-row height
    setAlignTarget({ span: 0, height: perRow });
    setAlignTick((t) => t + 1);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">Codex MultiTerm</span>
            <select
              className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={spawnCodex} className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Spawn Codex
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={spawnCodexResumeLatest}
              className="flex items-center gap-2"
              title="Resume last Codex session"
            >
              <History className="h-4 w-4" />
              Resume
            </Button>
            <Button variant="ghost" size="sm" onClick={spawnShell} className="flex items-center gap-2">
              <TerminalIcon className="h-4 w-4" />
              New Terminal
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProjects(true)}
              className="ml-auto flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Projects
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="model (optional)"
              value={cfgModel}
              onChange={(e) => {
                const v = e.target.value;
                setCfgModel(v);
                localStorage.setItem('mt.cfg.model', v);
              }}
              className="w-[180px]"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={cfgApproval}
              onChange={(e) => {
                const v = e.target.value;
                setCfgApproval(v);
                localStorage.setItem('mt.cfg.approval', v);
              }}
            >
              <option value="">Approval: default</option>
              <option value="never">never</option>
              <option value="on-request">on-request</option>
              <option value="on-failure">on-failure</option>
              <option value="untrusted">untrusted</option>
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={cfgSandbox}
              onChange={(e) => {
                const v = e.target.value;
                setCfgSandbox(v);
                localStorage.setItem('mt.cfg.sandbox', v);
              }}
            >
              <option value="">Sandbox: default</option>
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
            <Button
              variant={cfgWsNet ? 'secondary' : 'ghost'}
              size="sm"
              className="flex items-center gap-2"
              onClick={() => {
                const v = !cfgWsNet;
                setCfgWsNet(v);
                localStorage.setItem('mt.cfg.wsnet', v ? '1' : '0');
              }}
              title="Allow network inside workspace-write sandbox"
            >
              <Wifi className="h-4 w-4" /> Net {cfgWsNet ? 'On' : 'Off'}
            </Button>
            <div className="hidden flex-1 md:block" />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => alignGrid('auto')}>
                <Grid3x3 className="h-4 w-4" /> Align Grid
              </Button>
              <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={alignFillHeight}>
                <Scan className="h-4 w-4" /> Fill Height
              </Button>
              <Button
                variant={sync ? 'secondary' : 'ghost'}
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  const v = !sync;
                  setSync(v);
                  localStorage.setItem('mt.sync', v ? '1' : '0');
                }}
              >
                <Share2 className="h-4 w-4" /> Sync {sync ? 'On' : 'Off'}
              </Button>
              <Button
                variant={voice ? 'secondary' : 'ghost'}
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  const v = !voice;
                  setVoice(v);
                  localStorage.setItem('mt.voice', v ? '1' : '0');
                }}
              >
                <AudioLines className="h-4 w-4" /> Voice {voice ? 'On' : 'Off'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <Dashboard
          projects={projects}
          sessions={sessions}
          setSessions={setSessions}
          sync={sync}
          voice={voice}
          align={alignTarget ? { ...alignTarget, tick: alignTick } : null}
          onBroadcast={broadcastInput}
        />
      </main>
      <Modal title="Projects" open={showProjects} onClose={() => setShowProjects(false)} className="max-w-6xl">
        <Projects
          onOpen={(p) => {
            setShowProjects(false);
            onSelect(p.id);
            setProjects((v) => [...v.filter((x) => x.id !== p.id), p]);
          }}
          onClose={() => setShowProjects(false)}
        />
      </Modal>
    </div>
  );
}
