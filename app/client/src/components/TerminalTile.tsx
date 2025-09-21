import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import 'xterm/css/xterm.css';
import type { TerminalSession, OutputFrame, InputChunk } from '@/types/domain';
import { api } from '@/lib/api';
import { createStream, ConnState } from '@/lib/ws';

import type { Project } from '@/types/domain';

export function TerminalTile({ session, project, onClose }: { session: TerminalSession; project: Project | null; onClose: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [conn, setConn] = useState<ConnState>('Reconnecting');
  const [outstanding, setOutstanding] = useState(0);
  const seqRef = useRef(0);
  const streamRef = useRef<ReturnType<typeof createStream> | null>(null);
  const projectId = project?.id || session.projectId;
  const prefKey = useMemo(() => (k: string) => `mt.${projectId}.${k}`, [projectId]);
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

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, ui-monospace, monospace',
      scrollback: 5000,
      fontSize,
      theme: isDark ? {
        background: '#0b1220',
        foreground: '#e5e7eb',
        cursor: '#22d3ee',
        selection: '#1f2937'
      } : undefined,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    try { term.loadAddon(new WebglAddon()); } catch {}
    termRef.current = term;
    fitRef.current = fit;
    if (ref.current) term.open(ref.current);
    setTimeout(() => fit.fit(), 50);

    function onFrame(f: OutputFrame) {
      // Decode base64 in browser without Node Buffer
      const bin = atob(f.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const data = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      term.write(data);
    }

    // Backlog then live
    let mounted = true;
    api.scrollback(session.id, 0).then(({ to, frames }) => {
      if (!mounted) return;
      for (const f of frames) onFrame(f);
      const stream = createStream(session.id, onFrame, { from: to, onState: setConn });
      streamRef.current = stream;
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      const cols = term.cols, rows = term.rows;
      api.resize(session.id, cols, rows).catch(() => {});
      if (ref.current) {
        const h = ref.current.clientHeight;
        if (Math.abs(h - termHeight) > 2) {
          setTermHeight(h);
          try { localStorage.setItem(prefKey('termHeight'), String(h)); } catch {}
        }
      }
    });
    if (ref.current) ro.observe(ref.current);

    term.onData((d) => {
      // chunk to 32KB, maintain client seq
      const enc = new TextEncoder();
      const bytes = enc.encode(d);
      const chunkSize = 32 * 1024;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.slice(i, i + chunkSize);
        const chunk: InputChunk = { sessionId: session.id, seq: ++seqRef.current, dataBase64: btoa(String.fromCharCode(...slice)) };
        streamRef.current?.send(chunk);
      }
    });

    return () => {
      mounted = false;
      streamRef.current?.close();
      term.dispose();
    };
  }, [session.id]);

  useEffect(() => {
    if (termRef.current && fitRef.current) {
      setTimeout(() => { fitRef.current!.fit(); api.resize(session.id, termRef.current!.cols, termRef.current!.rows).catch(() => {}); }, 10);
    }
  }, [span]);

  const footerState = conn === 'Live' ? 'live' : conn === 'Polling' ? 'polling' : 'reconnecting';

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

  return (
    <div className="tile" style={{ gridColumn: `span ${span} / span ${span}` }}>
      <div className="tile-h">
        <strong style={{ marginRight: 8 }}>{headerTitle}</strong>
        <span>• {session.status}{session.exitCode !== undefined ? ` (${session.exitCode})` : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn" title="Narrower" onClick={() => adjustSpan(-1)}>⬌−</button>
          <button className="btn" title="Wider" onClick={() => adjustSpan(+1)}>⬌+</button>
          <button className="btn" title="Font smaller" onClick={() => adjustFont(-1)}>A−</button>
          <button className="btn" title="Font larger" onClick={() => adjustFont(+1)}>A+</button>
          <button className="btn" onClick={() => api.stopSession(session.id)}>Stop</button>
          <button className="btn" onClick={() => { api.deleteSession(session.id).then(() => onClose(session.id)); }}>Close</button>
        </div>
      </div>
      <div className="term" ref={ref} style={{ height: termHeight, resize: 'vertical', overflow: 'auto', flex: 'unset' }} />
      <div className="tile-f">
        <span><span className={`status-dot ${footerState}`}></span> {conn}</span>
        <span>Scrollback ≤ 5000 • PTY: {session.pty ? 'yes' : 'no'}</span>
      </div>
    </div>
  );
}
