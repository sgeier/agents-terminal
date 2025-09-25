import { useMemo } from 'react';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Dashboard({ projects, sessions, setSessions, sync, voice, align, onBroadcast }: { projects: Project[]; sessions: TerminalSession[]; setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>; sync: boolean; voice: boolean; align: ({ span: number; height: number; tick: number } | null); onBroadcast: (fromId: string, bytes: Uint8Array) => void }) {
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  if (!sessions.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-lg border-dashed border-border/60 bg-card/60 text-center">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">No sessions yet</CardTitle>
            <CardDescription className="text-muted-foreground">
              Spawn a shell or Codex session to populate the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sessions appear here automatically and adopt your saved layout preferences.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid auto-rows-min grid-cols-12 gap-4">
        {sessions.map((s) => {
          const proj = projectMap.get(s.projectId) || null;
          return (
            <TerminalTile
              key={s.id}
              session={s}
              project={proj}
              sync={sync}
              voiceGlobal={voice}
              align={align}
              onBroadcast={onBroadcast}
              onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))}
            />
          );
        })}
      </div>
    </div>
  );
}
