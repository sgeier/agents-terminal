import type { OutputFrame, InputChunk } from '@/types/domain';
import { api, wsUrl } from './api';

export type ConnState = 'Live' | 'Polling' | 'Reconnecting' | 'Closed';

export interface StreamClient {
  state: ConnState;
  lastSeq: number;
  send(chunk: InputChunk): void;
  close(): void;
}

export function createStream(
  sessionId: string,
  onFrame: (f: OutputFrame) => void,
  opts?: { from?: number; onState?: (s: ConnState) => void; onGone?: () => void },
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

  async function checkExists() {
    try { await api.getSession(sessionId); return true; } catch { return false; }
  }

  function startPolling() {
    setState('Polling');
    const run = async () => {
      try {
        const exists = await checkExists();
        if (!exists) {
          setState('Closed');
          opts?.onGone?.();
          stopPolling();
          return;
        }
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
    ws.onclose = (ev) => {
      stopPolling();
      if (ev.code === 1008 || String(ev.reason).includes('no such session')) {
        setState('Closed');
        opts?.onGone?.();
        return;
      }
      setState('Reconnecting');
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
