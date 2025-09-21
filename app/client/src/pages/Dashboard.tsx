import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';
import { MetricsBar } from '@/components/MetricsBar';
import { MetricsDrawer } from '@/components/MetricsDrawer';

export function Dashboard({ project, projects, sessions, setSessions, sync, onBroadcast }: { project: Project | null; projects: Project[]; sessions: TerminalSession[]; setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>; sync: boolean; onBroadcast: (fromId: string, bytes: Uint8Array) => void }) {
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const [showDrawer, setShowDrawer] = useState(false);

  return (
    <div>
      <MetricsBar onOpenDrawer={() => setShowDrawer(true)} />
      <div className="grid">
        {sessions.map((s) => {
          const proj = projectMap.get(s.projectId);
          return (
            <TerminalTile key={s.id} session={s} project={proj || null} sync={sync} onBroadcast={onBroadcast} onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))} />
          );
        })}
      </div>
      <MetricsDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
    </div>
  );
}
