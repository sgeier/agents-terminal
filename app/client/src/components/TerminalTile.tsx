import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Menlo, Monaco, Consolas, ui-monospace, monospace',
      scrollback: 5000,
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
      const dims = term._core._renderService.dimensions; // eslint-disable-line @typescript-eslint/no-explicit-any
      const cols = term.cols, rows = term.rows;
      api.resize(session.id, cols, rows).catch(() => {});
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

  const footerState = conn === 'Live' ? 'live' : conn === 'Polling' ? 'polling' : 'reconnecting';

  const labelCmd = session.command?.[0] ? session.command[0] : 'shell';
  const headerTitle = `${project?.name || session.cwd.split('/').pop()} • ${labelCmd} • pid ${session.pid ?? '—'}`;

  return (
    <div className="tile">
      <div className="tile-h">
        <strong style={{ marginRight: 8 }}>{headerTitle}</strong>
        <span>• {session.status}{session.exitCode !== undefined ? ` (${session.exitCode})` : ''}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={() => api.stopSession(session.id)}>Stop</button>
          <button className="btn" onClick={() => { api.deleteSession(session.id).then(() => onClose(session.id)); }}>Close</button>
        </div>
      </div>
      <div className="term" ref={ref} />
      <div className="tile-f">
        <span><span className={`status-dot ${footerState}`}></span> {conn}</span>
        <span>Scrollback ≤ 5000 • PTY: {session.pty ? 'yes' : 'no'}</span>
      </div>
    </div>
  );
}
