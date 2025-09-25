import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
// WebGL renderer disabled for robustness
import 'xterm/css/xterm.css';
import { ArrowLeftRight, Volume2, VolumeX, ExternalLink, X } from 'lucide-react';
import type { TerminalSession, OutputFrame, InputChunk } from '@/types/domain';
import type { Project } from '@/types/domain';
import { api } from '@/lib/api';
import { createStream, ConnState } from '@/lib/ws';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function TerminalTile({ session, project, onClose, sync, voiceGlobal, align, onBroadcast }: { session: TerminalSession; project: Project | null; onClose: (id: string) => void; sync: boolean; voiceGlobal: boolean; align: ({ span: number; height: number; tick: number } | null); onBroadcast: (fromId: string, bytes: Uint8Array) => void }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [focused, setFocused] = useState(false);
  const [conn, setConn] = useState<ConnState>('Reconnecting');
  const [status, setStatus] = useState<string>(session.status);
  const [outstanding, setOutstanding] = useState(0);
  const seqRef = useRef(0);
  const streamRef = useRef<ReturnType<typeof createStream> | null>(null);
  const inputQueueRef = useRef<Uint8Array[]>([]);
  const inputTimerRef = useRef<number | null>(null);
  const projectId = project?.id || session.projectId;
  const prefKey = useMemo(() => (k: string) => `mt.${projectId}.${k}`, [projectId]);
  const [projBg, setProjBg] = useState<string>(() => project?.bgColor || '');
  const [projImg, setProjImg] = useState<string>(() => project?.bgImage || '');
  const [projOpacity, setProjOpacity] = useState<number>(() => (typeof project?.bgOpacity === 'number' ? (project!.bgOpacity as number) : 0.94));
  const [fontSize, setFontSize] = useState<number>(() => {
    const raw = localStorage.getItem(prefKey('fontSize')) || localStorage.getItem('mt.fontSize.default');
    const n = raw ? Number(raw) : NaN; return Number.isFinite(n) ? n : 13;
  });
  const [termHeight, setTermHeight] = useState<number>(() => {
    const raw = localStorage.getItem(prefKey('termHeight'));
    const n = raw ? Number(raw) : NaN; return Number.isFinite(n) ? n : 320;
  });
  const [span, setSpan] = useState<number>(() => {
    const raw = localStorage.getItem(prefKey('span'));
    const n = raw ? Number(raw) : NaN; return Number.isFinite(n) ? Math.min(12, Math.max(3, n)) : 4; // 4/12 default ~ 3 per row
  });
  const [voiceLocal, setVoiceLocal] = useState<boolean>(() => {
    const raw = localStorage.getItem(prefKey('voice'));
    if (raw === '0' || raw === '1') return raw === '1';
    return voiceGlobal; // default to global setting
  });
  // If no explicit local preference exists, follow changes to global
  useEffect(() => {
    const raw = localStorage.getItem(prefKey('voice'));
    if (raw !== '0' && raw !== '1') setVoiceLocal(voiceGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceGlobal, prefKey]);
  // Renderer and resize strategy are fixed (Canvas + deferred PTY resize)
  // Apply global align when requested
  useEffect(() => {
    if (!align) return;
    const { span: aSpan, height: aHeight } = align;
    const nextH = Math.max(180, Math.min(window.innerHeight - 160, aHeight));
    // Preserve current span if aSpan <= 0
    if (aSpan > 0) {
      const nextSpan = Math.min(12, Math.max(3, aSpan));
      if (span !== nextSpan) {
        setSpan(nextSpan);
        try { localStorage.setItem(prefKey('span'), String(nextSpan)); } catch {}
      }
    }
    if (termHeight !== nextH) {
      setTermHeight(nextH);
      try { localStorage.setItem(prefKey('termHeight'), String(nextH)); } catch {}
    }
    if (fitRef.current && termRef.current) {
      try {
        fitRef.current.fit();
        const cols = termRef.current.cols, rows = termRef.current.rows;
        api.resize(session.id, cols, rows).catch(() => {});
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [align?.tick]);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, ui-monospace, monospace',
      scrollback: 5000,
      fontSize,
      theme: ((): any => {
        const darkBg = projBg || '#0b1220';
        const alpha = Math.min(1, Math.max(0.0, projOpacity));
        const transparentHint = projImg ? `rgba(11,18,32,${alpha || 0.94})` : darkBg;
        const darkTheme = {
          background: transparentHint,
          foreground: '#e5e7eb',
          cursor: '#22d3ee',
          selection: '#1f2937'
        };
        if (isDark) return darkTheme;
        if (projBg) return { background: projBg } as any;
        // Light default: keep default xterm theme unless image provided
        if (projImg) return { background: `rgba(255,255,255,${alpha || 0.92})` } as any;
        return undefined;
      })(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // WebGL disabled
    termRef.current = term;
    fitRef.current = fit;
    if (ref.current) term.open(ref.current);
    // focus/blur visual state
    // xterm v5 no longer exposes onFocus/onBlur; rely on DOM focus events instead
    const onFocusIn = () => setFocused(true);
    const onFocusOut = () => setFocused(false);
    if (ref.current) {
      // use capture so the hidden textarea inside xterm triggers these
      ref.current.addEventListener('focusin', onFocusIn);
      ref.current.addEventListener('focusout', onFocusOut);
    }

    const fitTimer: { id: number | null } = { id: null };
    const lastDims = { cols: 0, rows: 0 };
    const scheduleFit = () => {
      if (fitTimer.id !== null) { clearTimeout(fitTimer.id); }
      fitTimer.id = window.setTimeout(() => {
        fitTimer.id = null;
        try {
          fit.fit();
          term.refresh(0, term.rows - 1);
          const cols = term.cols, rows = term.rows;
          // record target size; defer PTY resize until settle
          lastDims.cols = cols; lastDims.rows = rows;
        } catch {}
      }, 120);
    };
    // initial fit after mount
    setTimeout(() => scheduleFit(), 30);

    // rAF write queue for stable paints
    const writeQueue: Uint8Array[] = [];
    let raf: number | null = null;
    const flush = () => {
      raf = null;
      try {
        while (writeQueue.length) {
          const chunk = writeQueue.shift()!;
          (term as any).writeUtf8 ? (term as any).writeUtf8(chunk) : term.write(new TextDecoder().decode(chunk));
        }
      } catch {}
    };
    function onFrame(f: OutputFrame) {
      const bin = atob(f.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      writeQueue.push(bytes);
      if (raf == null) {
        raf = ('requestAnimationFrame' in window)
          ? window.requestAnimationFrame(flush)
          : window.setTimeout(flush, 16) as unknown as number;
      }
      if (status !== 'running') setStatus('running');
    }

    // Backlog then live
    let mounted = true;
    api.scrollback(session.id, 0).then(({ to, frames }) => {
      if (!mounted) return;
      for (const f of frames) onFrame(f);
      const stream = createStream(session.id, onFrame, { from: to, onState: setConn, onGone: () => setStatus('exited') });
      streamRef.current = stream;
    }).catch(() => { setConn('Closed'); setStatus('exited'); });

    const ro = new ResizeObserver(() => {
      scheduleFit();
      if (ref.current) {
        const h = ref.current.clientHeight;
        if (Math.abs(h - termHeight) > 2) {
          setTermHeight(h);
          try { localStorage.setItem(prefKey('termHeight'), String(h)); } catch {}
        }
      }
    });
    if (ref.current) ro.observe(ref.current);
    let finalizeTimer: number | null = null;
    const onWinResize = () => {
      scheduleFit();
      if (finalizeTimer) window.clearTimeout(finalizeTimer);
      finalizeTimer = window.setTimeout(() => {
        try {
          fit.fit();
          term.refresh(0, term.rows - 1);
          const cols = term.cols, rows = term.rows;
          if (cols !== lastDims.cols || rows !== lastDims.rows) {
            lastDims.cols = cols; lastDims.rows = rows;
            api.resize(session.id, cols, rows).catch(() => {});
          }
        } catch {}
      }, 220) as any;
    };
    window.addEventListener('resize', onWinResize);
    const onVisibility = () => { try { term.refresh(0, term.rows - 1); } catch {} };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    const flushInput = () => {
      inputTimerRef.current = null;
      const chunks = inputQueueRef.current;
      if (!chunks.length) return;
      let total = 0; for (const c of chunks) total += c.length;
      const merged = new Uint8Array(total);
      let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
      inputQueueRef.current = [];
      const max = 32 * 1024;
      for (let i = 0; i < merged.length; i += max) {
        const slice = merged.slice(i, i + max);
        const b64 = btoa(String.fromCharCode(...slice));
        const chunk: InputChunk = { sessionId: session.id, seq: ++seqRef.current, dataBase64: b64 };
        streamRef.current?.send(chunk);
        if (sync) onBroadcast(session.id, slice);
      }
    };

    term.onData((d) => {
      const enc = new TextEncoder();
      inputQueueRef.current.push(enc.encode(d));
      if (inputTimerRef.current == null) {
        inputTimerRef.current = window.setTimeout(flushInput, 16);
      }
    });

    return () => {
      mounted = false;
      streamRef.current?.close();
      // flush any pending input to avoid loss
      try { if (inputTimerRef.current != null) { clearTimeout(inputTimerRef.current); (inputTimerRef.current as any) = null; } } catch {}
      try {
        const chunks = inputQueueRef.current; inputQueueRef.current = [];
        if (chunks.length) {
          let total = 0; for (const c of chunks) total += c.length;
          const merged = new Uint8Array(total); let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
          const max = 32 * 1024;
          for (let i = 0; i < merged.length; i += max) {
            const slice = merged.slice(i, i + max);
            const b64 = btoa(String.fromCharCode(...slice));
            const chunk: InputChunk = { sessionId: session.id, seq: ++seqRef.current, dataBase64: b64 };
            streamRef.current?.send(chunk);
          }
        }
      } catch {}
      term.dispose();
      try {
        if (ref.current) {
          ref.current.removeEventListener('focusin', onFocusIn);
          ref.current.removeEventListener('focusout', onFocusOut);
        }
      } catch {}
      window.removeEventListener('resize', onWinResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [session.id]);

  // Apply theme updates when project color/image/opacity or dark mode changes
  useEffect(() => {
    const applyTheme = () => {
      if (!termRef.current) return;
      const isDark = document.documentElement.classList.contains('dark');
      const darkBg = projBg || '#0b1220';
      const alpha = Math.min(1, Math.max(0.0, projOpacity));
      const theme: any = isDark
        ? { background: (projImg ? `rgba(11,18,32,${alpha || 0.94})` : darkBg), foreground: '#e5e7eb', cursor: '#22d3ee', selection: '#1f2937' }
        : (projBg ? { background: projBg } : (projImg ? { background: `rgba(255,255,255,${alpha || 0.92})` } : undefined));
      try { (termRef.current.options as any).theme = theme; } catch {}
    };
    applyTheme();
    // Observe dark class changes to react to theme toggle
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [projBg, projImg, projOpacity, projectId]);

  // Listen for project updates (bgColor/bgImage) from Projects modal
  useEffect(() => {
    const onProjectUpdated = (e: Event) => {
      const p = (e as CustomEvent).detail as Project | undefined;
      if (!p || p.id !== projectId) return;
      setProjBg(p.bgColor || '');
      setProjImg(p.bgImage || '');
      setProjOpacity(typeof p.bgOpacity === 'number' ? p.bgOpacity : 0.94);
    };
    window.addEventListener('mt.project.updated', onProjectUpdated as any);
    return () => {
      window.removeEventListener('mt.project.updated', onProjectUpdated as any);
    };
  }, [projectId]);

  // Also update if the project prop itself changes
  useEffect(() => {
    setProjBg(project?.bgColor || '');
    setProjImg(project?.bgImage || '');
    setProjOpacity(typeof project?.bgOpacity === 'number' ? (project!.bgOpacity as number) : 0.94);
  }, [project?.bgColor, project?.bgImage, project?.bgOpacity, project?.id]);

  useEffect(() => { setStatus(session.status); }, [session.status]);

  useEffect(() => {
    if (termRef.current && fitRef.current) {
      // call scheduleFit via a small timeout by triggering resize observer path
      setTimeout(() => {
        try { fitRef.current!.fit(); } catch {}
      }, 10);
    }
  }, [span]);

  const footerState = conn === 'Live' ? 'live' : conn === 'Polling' ? 'polling' : conn === 'Closed' ? 'closed' : 'reconnecting';

  const labelCmd = session.command?.[0] ? session.command[0] : 'shell';
  const headerTitle = `${project?.name || session.cwd.split('/').pop()} • ${labelCmd} • pid ${session.pid ?? '—'}`;

  function adjustFont(delta: number) {
    const next = Math.min(20, Math.max(10, fontSize + delta));
    setFontSize(next);
    try { localStorage.setItem(prefKey('fontSize'), String(next)); } catch {}
    if (termRef.current && fitRef.current) {
      // @ts-expect-error xterm option setter
      (termRef.current.options as any).fontSize = next;
      setTimeout(() => { fitRef.current!.fit(); api.resize(session.id, termRef.current!.cols, termRef.current!.rows).catch(() => {}); }, 10);
    }
  }

  function adjustSpan(delta: number) {
    const next = Math.min(12, Math.max(3, span + delta));
    setSpan(next);
    try { localStorage.setItem(prefKey('span'), String(next)); } catch {}
  }

  // Renderer/resize mode are fixed: Canvas + deferred PTY resize

  function startWidthDrag(ev: React.PointerEvent) {
    ev.preventDefault();
    const wrap = wrapperRef.current!;
    const parent = wrap.parentElement as HTMLElement;
    const startX = ev.clientX;
    const startWidth = wrap.getBoundingClientRect().width;
    const gridW = parent.getBoundingClientRect().width;
    const colW = gridW / 12;
    function onMove(e: PointerEvent) {
      const dx = e.clientX - startX;
      const w = Math.max(colW * 3, Math.min(gridW, startWidth + dx));
      const newSpan = Math.max(3, Math.min(12, Math.round(w / colW)));
      if (newSpan !== span) {
        setSpan(newSpan);
        try { localStorage.setItem(prefKey('span'), String(newSpan)); } catch {}
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (fitRef.current && termRef.current) {
        try {
          fitRef.current.fit();
          const cols = termRef.current.cols, rows = termRef.current.rows;
          api.resize(session.id, cols, rows).catch(() => {});
        } catch {}
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startHeightDrag(ev: React.PointerEvent) {
    ev.preventDefault();
    const startY = ev.clientY;
    const startH = termHeight;
    function onMove(e: PointerEvent) {
      const dy = e.clientY - startY;
      const h = Math.max(180, Math.min(window.innerHeight - 160, startH + dy));
      setTermHeight(h);
      try { localStorage.setItem(prefKey('termHeight'), String(h)); } catch {}
      if (termRef.current && fitRef.current) {
        try { fitRef.current!.fit(); } catch {}
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (fitRef.current && termRef.current) {
        try {
          fitRef.current.fit();
          const cols = termRef.current.cols, rows = termRef.current.rows;
          api.resize(session.id, cols, rows).catch(() => {});
        } catch {}
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'group relative flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-lg backdrop-blur transition-all duration-200',
        focused && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
      )}
      style={{
        gridColumn: `span ${span} / span ${span}`,
        backgroundColor: projBg || undefined,
        backgroundImage: projImg
          ? `linear-gradient(135deg, rgba(8,12,20,0.85), rgba(8,12,20,0.55)), url(${projImg})`
          : undefined,
        backgroundSize: projImg ? 'cover' : undefined,
        backgroundPosition: projImg ? 'center' : undefined,
      }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/70 px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{headerTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{session.cwd}</p>
        </div>
        <Badge variant="secondary" className="bg-secondary/80 text-secondary-foreground">
          {status}
          {session.exitCode !== undefined ? ` (${session.exitCode})` : ''}
        </Badge>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" title="Narrower" onClick={() => adjustSpan(-1)}>
            <ArrowLeftRight className="h-4 w-4 -scale-x-100" />
          </Button>
          <Button variant="ghost" size="icon" title="Wider" onClick={() => adjustSpan(+1)}>
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Font smaller"
            className="px-2 text-xs"
            onClick={() => adjustFont(-1)}
          >
            A−
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Font larger"
            className="px-2 text-xs"
            onClick={() => adjustFont(+1)}
          >
            A+
          </Button>
          <Button
            variant={voiceLocal ? 'secondary' : 'ghost'}
            size="icon"
            title="Toggle voice summaries for this terminal"
            onClick={() => {
              const v = !voiceLocal;
              setVoiceLocal(v);
              try { localStorage.setItem(prefKey('voice'), v ? '1' : '0'); } catch {}
            }}
          >
            {voiceLocal ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          {project && (
            <Button
              variant="outline"
              size="icon"
              title="Open project in Cursor"
              onClick={() => { api.openProjectInCursor(project.id).catch(() => {}); }}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title="Close session"
            onClick={() => { api.deleteSession(session.id).then(() => onClose(session.id)); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div
        ref={ref}
        className="relative flex-1"
        style={{ height: termHeight }}
        onMouseDown={() => termRef.current?.focus()}
      />

      <div
        className="absolute inset-y-[56px] right-0 w-2 cursor-col-resize bg-transparent transition group-hover:bg-primary/30"
        onPointerDown={startWidthDrag}
      />
      <div
        className="absolute bottom-0 left-[56px] right-[56px] h-2 cursor-row-resize bg-transparent transition group-hover:bg-primary/30"
        onPointerDown={startHeightDrag}
      />
      <div
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-transparent transition group-hover:bg-primary/40"
        onPointerDown={(e) => {
          startWidthDrag(e);
          startHeightDrag(e);
        }}
      />

      <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/70 px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full',
            footerState === 'live' ? 'bg-emerald-400' : footerState === 'polling' ? 'bg-amber-400' : footerState === 'closed' ? 'bg-slate-500' : 'bg-rose-500'
          )} />
          {conn}
        </span>
        <span className="hidden sm:inline-flex">Scrollback ≤ 5000 • PTY: {session.pty ? 'yes' : 'no'}</span>
        <span className="sm:hidden">PTY: {session.pty ? 'yes' : 'no'}</span>
      </footer>
    </div>
  );
}
