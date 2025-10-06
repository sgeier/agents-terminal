import { useMemo } from 'react';
import type { TerminalSession, Project } from '@/types/domain';
import { TerminalTile } from '@/components/TerminalTile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Dashboard({ projects, sessions, setSessions, sync, voice, align, onBroadcast, focusedSessionId, onFocusToggle }: { projects: Project[]; sessions: TerminalSession[]; setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>; sync: boolean; voice: boolean; align: ({ span: number; height: number; tick: number } | null); onBroadcast: (fromId: string, bytes: Uint8Array) => void; focusedSessionId: string | null; onFocusToggle: (id: string) => void }) {
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

  // Compute intelligent layout spans for special case: 3 windows (2+1 layout)
  const getCustomSpan = (index: number, total: number): number | undefined => {
    // Single window: full width
    if (total === 1) {
      return 12;
    }
    // 3 windows: third one gets full width
    if (total === 3 && index === 2) {
      return 12;
    }
    return undefined; // Use default from align
  };

  const focusedSession = focusedSessionId ? sessions.find((s) => s.id === focusedSessionId) : null;

  return (
    <>
      <div className="flex-1 overflow-auto p-4">
        <div
          className="grid grid-cols-12 gap-4"
          style={{ gridAutoRows: '12px', gridAutoFlow: 'dense' }}
        >
          {sessions.map((s, idx) => {
            const proj = projectMap.get(s.projectId) || null;
            const customSpan = getCustomSpan(idx, sessions.length);

            return (
              <TerminalTile
                key={s.id}
                session={s}
                project={proj}
                sync={sync}
                voiceGlobal={voice}
                align={align}
                customSpan={customSpan}
                onBroadcast={onBroadcast}
                onClose={(id) => setSessions((v) => v.filter((x) => x.id !== id))}
                focusMode={false}
                onFocusToggle={() => onFocusToggle(s.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Focus Mode Modal Overlay */}
      {focusedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => onFocusToggle(focusedSession.id)}
        >
          <div
            className="relative w-[90vw] h-[90vh] animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <TerminalTile
              session={focusedSession}
              project={projectMap.get(focusedSession.projectId) || null}
              sync={sync}
              voiceGlobal={voice}
              align={null}
              customSpan={12}
              onBroadcast={onBroadcast}
              onClose={(id) => {
                setSessions((v) => v.filter((x) => x.id !== id));
                onFocusToggle(id);
              }}
              focusMode={true}
              onFocusToggle={() => onFocusToggle(focusedSession.id)}
            />
          </div>
        </div>
      )}
    </>
  );
}
