import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';

export function Dashboard({ project, projects, sessions, setSessions, sync, onBroadcast }: { project: Project | null; projects: Project[]; sessions: TerminalSession[]; setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>; sync: boolean; onBroadcast: (fromId: string, bytes: Uint8Array) => void }) {
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  return (
    <div>
      <div className="grid">
        {sessions.map((s) => {
          const proj = projectMap.get(s.projectId);
          return (
            <TerminalTile key={s.id} session={s} project={proj || null} sync={sync} onBroadcast={onBroadcast} onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))} />
          );
        })}
      </div>
      {/* metrics removed */}
    </div>
  );
}
