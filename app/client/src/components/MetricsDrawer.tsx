import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { MetricsSummary } from '@/types/domain';

export function MetricsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [m, setM] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const tick = async () => { try { const s = await api.metricsSummary(); if (mounted) setM(s); } catch {} };
    tick();
    const t = setInterval(tick, 2000);
    return () => { mounted = false; clearInterval(t); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="drawer">
      <div className="drawer-h">
        <strong>Metrics</strong>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <div className="drawer-b">
        {!m ? <div>Loading…</div> : (
          <div className="metrics-grid">
            <div className="card">
              <div className="card-h">Sessions</div>
              <div className="card-b">
                <div>Running: {m.sessions.running}</div>
                <div>Starting: {m.sessions.starting}</div>
                <div>Exited: {m.sessions.exited}</div>
                <div>Spawns total: {m.sessions.spawns.total} (pty {m.sessions.spawns.pty} · stdio {m.sessions.spawns.stdio})</div>
                <div>Exits total: {m.sessions.exits.total} (errors {m.sessions.exits.withError})</div>
                <div>First output ms: count {m.sessions.firstOutputMs.count}, avg {m.sessions.firstOutputMs.avg}, min {m.sessions.firstOutputMs.min}, max {m.sessions.firstOutputMs.max}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">WebSocket</div>
              <div className="card-b">
                <div>Connections: {m.ws.connections}</div>
                <div>Connect total: {m.ws.connectTotal}</div>
                <div>Disconnect total: {m.ws.disconnectTotal}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">I/O</div>
              <div className="card-b">
                <div>Output bytes: {m.io.outputBytes}</div>
                <div>Input bytes: {m.io.inputBytes}</div>
                <div>Ringbuffer lines dropped: {m.io.ringbufferLinesDropped}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

