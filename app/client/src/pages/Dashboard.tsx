import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';

export function Dashboard({ project }: { project: Project | null }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);

  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => {});
  }, []);

  async function spawn() {
    const s = await api.createSession({ projectId: project?.id, cwd: project?.cwd });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  return (
    <div>
      <div className="header">
        <strong>Dashboard</strong>
        <button className="btn" onClick={spawn}>New Session</button>
        <span style={{ color: '#6b7280' }}>
          Project: {project ? `${project.name} (${project.cwd})` : '—'}
        </span>
      </div>
      <div className="grid">
        {sessions.map((s) => (
          <TerminalTile key={s.id} session={s} onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))} />
        ))}
      </div>
    </div>
  );
}

