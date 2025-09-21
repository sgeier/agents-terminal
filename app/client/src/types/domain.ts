export type ProjectType = 'Codex' | 'Shell';

export interface Project {
  id: string;
  name: string;
  cwd: string; // absolute; parent of .multiterm
  type: ProjectType;
  autostart?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus = 'starting' | 'running' | 'exited' | 'failed';

export interface TerminalSession {
  id: string;
  projectId: string;
  pid?: number;
  cwd: string;
  command: string[]; // argv
  status: SessionStatus;
  createdAt: string;
  exitedAt?: string;
  exitCode?: number | null;
  scrollbackLines: number; // count maintained server-side (≤ 5000)
  pty?: boolean;
}

export interface OutputFrame { sessionId: string; seq: number; ts: number; dataBase64: string; }
export interface InputChunk  { sessionId: string; seq: number; dataBase64: string; isFinal?: boolean; }

// Metrics summary returned by /api/metrics-summary
export interface MetricsSummary {
  sessions: {
    running: number;
    starting: number;
    exited: number;
    spawns: { total: number; pty: number; stdio: number };
    exits: { total: number; withError: number };
    firstOutputMs: { count: number; avg: number; min: number; max: number };
  };
  io: { outputBytes: number; inputBytes: number; ringbufferLinesDropped: number };
  ws: { connections: number; connectTotal: number; disconnectTotal: number };
}
