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
    const headerEl = document.querySelector('.header') as HTMLElement | null;
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 64;
    const gridPaddingY = 16; // .grid padding top+bottom ~ 8px each
    const gapY = 8; // CSS grid gap
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
          <button className="btn" title="Spawn codex resume latest" onClick={spawnCodexResumeLatest}>Resume Latest</button>
          <button className="btn" onClick={spawnShell}>New Terminal</button>
        </div>
        <div className="right">
          <span className="select-wrap" title="Model override">
            <input
              className="select"
              placeholder="model (optional)"
              value={cfgModel}
              onChange={(e) => { const v = e.target.value; setCfgModel(v); localStorage.setItem('mt.cfg.model', v); }}
              style={{ width: 140 }}
            />
          </span>
          <span className="select-wrap" title="Approval policy">
            <select className="select" value={cfgApproval} onChange={(e) => { const v = e.target.value; setCfgApproval(v); localStorage.setItem('mt.cfg.approval', v); }}>
              <option value="">Approval: default</option>
              <option value="never">never</option>
              <option value="on-request">on-request</option>
              <option value="on-failure">on-failure</option>
              <option value="untrusted">untrusted</option>
            </select>
          </span>
          <span className="select-wrap" title="Sandbox mode">
            <select className="select" value={cfgSandbox} onChange={(e) => { const v = e.target.value; setCfgSandbox(v); localStorage.setItem('mt.cfg.sandbox', v); }}>
              <option value="">Sandbox: default</option>
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </span>
          <button
            className="btn"
            title="Allow network in workspace-write sandbox"
            onClick={() => { const v = !cfgWsNet; setCfgWsNet(v); localStorage.setItem('mt.cfg.wsnet', v ? '1' : '0'); }}
          >Net: {cfgWsNet ? 'On' : 'Off'}</button>
          <button className="btn" onClick={() => setShowProjects(true)}>Projects…</button>
          <button className="btn" title="Auto align tiles to a uniform size" onClick={() => alignGrid('auto')}>Align Grid</button>
          <button className="btn" title="Fill available page height" onClick={alignFillHeight}>Fill Height</button>
          <button className="btn" onClick={() => { const v = !sync; setSync(v); localStorage.setItem('mt.sync', v ? '1' : '0'); }}>Sync: {sync ? 'On' : 'Off'}</button>
          <button className="btn" onClick={() => { const v = !voice; setVoice(v); localStorage.setItem('mt.voice', v ? '1' : '0'); }}>Voice: {voice ? 'On' : 'Off'}</button>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>
      <Modal title="Projects" open={showProjects} onClose={() => setShowProjects(false)} hideClose>
        <Projects
          onOpen={(p) => { setShowProjects(false); onSelect(p.id); setProjects((v) => [...v.filter(x => x.id !== p.id), p]); }}
          onClose={() => setShowProjects(false)}
        />
      </Modal>
      <Dashboard project={selectedProject} projects={projects} sessions={sessions} setSessions={setSessions} sync={sync} voice={voice} align={alignTarget ? { ...alignTarget, tick: alignTick } : null} onBroadcast={broadcastInput} />
    </div>
  );
}
