export type ProjectType = 'Codex' | 'Shell';

export interface Project {
  id: string;
  name: string;
  cwd: string; // absolute; parent of .multiterm
  type: ProjectType;
  autostart?: boolean;
  // UI preferences (persisted in .multiterm/project.json)
  bgColor?: string;  // CSS color
  bgImage?: string;  // image URL (served by browser)
  bgOpacity?: number; // 0..1 overlay alpha when image is set
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
