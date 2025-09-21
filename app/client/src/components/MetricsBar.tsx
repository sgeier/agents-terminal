import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { MetricsSummary } from '@/types/domain';

function fmtBytes(n: number) {
  const u = ['B','KB','MB','GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function MetricsBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const [m, setM] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try { const s = await api.metricsSummary(); if (mounted) setM(s); } catch {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (!m) return null;
  return (
    <div className="metrics-bar">
      <span>Sessions: <strong>{m.sessions.running}</strong> running · {m.sessions.starting} starting · {m.sessions.exited} exited</span>
      <span>WS: <strong>{m.ws.connections}</strong> conns</span>
      <span>First output avg: <strong>{m.sessions.firstOutputMs.count ? `${m.sessions.firstOutputMs.avg} ms` : '—'}</strong></span>
      <span>IO out: <strong>{fmtBytes(m.io.outputBytes)}</strong></span>
      <button className="btn" onClick={onOpenDrawer}>Metrics…</button>
    </div>
  );
}

