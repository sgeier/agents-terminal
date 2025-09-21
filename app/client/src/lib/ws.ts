import type { OutputFrame, InputChunk } from '@/types/domain';
import { api, wsUrl } from './api';

export type ConnState = 'Live' | 'Polling' | 'Reconnecting';

export interface StreamClient {
  state: ConnState;
  lastSeq: number;
  send(chunk: InputChunk): void;
  close(): void;
}

export function createStream(
  sessionId: string,
  onFrame: (f: OutputFrame) => void,
  opts?: { from?: number; onState?: (s: ConnState) => void },
): StreamClient {
  let state: ConnState = 'Reconnecting';
  let lastSeq = opts?.from ?? 0;
  let ws: WebSocket | null = null;
  let pollTimer: any = null;
  let openedAt = 0;
  let openedSeenFirst = false;

  const setState = (s: ConnState) => {
    state = s; opts?.onState?.(state);
  };

  function startPolling() {
    setState('Polling');
    const run = async () => {
      try {
        const { frames } = await api.scrollback(sessionId, lastSeq);
        for (const f of frames) { lastSeq = f.seq; onFrame(f); }
      } catch {}
    };
    pollTimer = setInterval(run, 500);
    run();
  }

  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function connect() {
    setState('Reconnecting');
    openedSeenFirst = false;
    openedAt = Date.now();
    ws = new WebSocket(wsUrl(`/api/sessions/${sessionId}/stream?from=${lastSeq}`));
    const firstTimeout = setTimeout(() => {
      if (!openedSeenFirst) startPolling();
    }, 1500);

    ws.onopen = () => {
      setState('Live');
      stopPolling();
    };
    ws.onmessage = (ev) => {
      const f = JSON.parse(String(ev.data)) as OutputFrame;
      if (!openedSeenFirst) openedSeenFirst = true;
      if (f.seq > lastSeq) { lastSeq = f.seq; onFrame(f); }
    };
    ws.onclose = () => {
      setState('Reconnecting');
      stopPolling();
      setTimeout(connect, Math.min(5000, Date.now() - openedAt < 200 ? 1000 : 2000));
    };
    ws.onerror = () => {
      setState('Reconnecting');
      try { ws?.close(); } catch {}
      startPolling();
    };
  }

  connect();

  return {
    get state() { return state; },
    get lastSeq() { return lastSeq; },
    send: (chunk: InputChunk) => {
      const msg = JSON.stringify(chunk);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      else api.input(sessionId, chunk).catch(() => {});
    },
    close: () => { try { ws?.close(); } catch {}; stopPolling(); },
  };
}

