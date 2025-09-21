import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';

export function Dashboard({ project, projects }: { project: Project | null; projects: Project[] }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => {});
  }, []);

  async function spawnShell() {
    const s = await api.createSession({ projectId: project?.id, cwd: project?.cwd });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  async function spawnCodex() {
    const s = await api.createSession({ projectId: project?.id, cwd: project?.cwd, command: ['codex'] });
    setSessions((v) => [s, ...v].slice(0, 12));
  }

  return (
    <div>
      <div className="header">
        <button className="btn" onClick={spawnCodex}>Spawn</button>
        <button className="btn" onClick={spawnShell}>New Terminal</button>
        <span style={{ color: '#6b7280' }}>Project: {project ? project.name : '—'}</span>
      </div>
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
