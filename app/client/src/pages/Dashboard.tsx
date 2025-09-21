import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';

export function Dashboard({ project, projects, sessions, setSessions }: { project: Project | null; projects: Project[]; sessions: TerminalSession[]; setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>> }) {
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  return (
    <div>
      <div className="grid">
        {sessions.map((s) => {
          const proj = projectMap.get(s.projectId);
          return (
            <TerminalTile key={s.id} session={s} project={proj || null} onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))} />
          );
        })}
      </div>
    </div>
  );
}
