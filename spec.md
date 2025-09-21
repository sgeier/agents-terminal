

You are building a local web app to spawn and interact with multiple terminal sessions per project.

Hard Requirements (locked)
	•	OS: Must run on macOS today; also support Windows (ConPTY) and macOS out of the box.
	•	Frontend: React + TypeScript with shadcn/ui and xterm.js.
	•	Backend: Node.js (TypeScript) with node-pty (PTY); fallback to child_process.spawn if PTY not available.
	•	Persistence: Store project metadata inside each project directory under .multiterm/ (JSON files). No global DB.
	•	Shell defaults:
	•	macOS: detect process.env.SHELL; fallback /bin/bash -l.
	•	Windows: powershell.exe -NoLogo -NoProfile via ConPTY; fallback cmd.exe if needed.
	•	Scrollback: max 5000 lines per session (ring buffer).
	•	Transport: single HTTP server (same port) with REST + WebSocket. Fallback polling at 500 ms.
	•	POC focus: choose smart defaults; avoid extra config. Make it just work.

Domain Types (TS)

type ProjectType = 'Codex' | 'Shell';

interface Project {
  id: string;
  name: string;
  cwd: string;                 // absolute; parent of .multiterm
  type: ProjectType;
  autostart?: boolean;
  createdAt: string;
  updatedAt: string;
}

type SessionStatus = 'starting' | 'running' | 'exited' | 'failed';

interface TerminalSession {
  id: string;
  projectId: string;
  pid?: number;
  cwd: string;
  command: string[];           // argv
  status: SessionStatus;
  createdAt: string;
  exitedAt?: string;
  exitCode?: number | null;
  scrollbackLines: number;     // count maintained server-side (≤ 5000)
}

interface OutputFrame { sessionId: string; seq: number; ts: number; dataBase64: string; }
interface InputChunk  { sessionId: string; seq: number; dataBase64: string; isFinal?: boolean; }

API

Projects
	•	GET /api/projects → Project[]
	•	POST /api/projects {name,cwd,type,autostart} → Project (creates .multiterm/project.json)
	•	PATCH /api/projects/:id → Project
	•	DELETE /api/projects/:id → {ok:true} (removes .multiterm/project.json only)

Sessions
	•	POST /api/sessions {projectId?, cwd?, command?} → TerminalSession (status starting → running)
	•	GET /api/sessions → TerminalSession[]
	•	GET /api/sessions/:id → TerminalSession
	•	POST /api/sessions/:id/stop → {ok:true} (TERM → KILL after 3s)
	•	DELETE /api/sessions/:id → {ok:true} (cleanup)

Streaming & Fallback
	•	WS /api/sessions/:id/stream
	•	Server→Client: OutputFrame (strictly increasing seq)
	•	Client→Server: InputChunk (ordered by seq)
	•	Resume: client may connect with ?from=<lastSeq>
	•	GET /api/sessions/:id/scrollback?from=<seq> → {from,to,frames:OutputFrame[]}
	•	If first WS byte not seen in 1.5s, client switches to polling every 500 ms.
	•	Input fallback: POST /api/sessions/:id/input with InputChunk.

Backend Behavior
	•	Spawn: node-pty with detected shell (see defaults). If PTY fails, use spawn (stdio: 'pipe'), mark pty:false.
	•	Resize: accept {cols,rows} via POST /api/sessions/:id/resize to issue PTY resize() (or ignore on stdio).
	•	Scrollback: in-memory ring buffer of 5000 lines; broadcast live frames to all WS subscribers; dedupe on resume via seq.
	•	Exit: mark exited; keep scrollback; tile remains until user closes.
	•	Logging (structured): spawn/exit, WS connect/disconnect, input/output sizes, fallbacks. Never log raw input, only byte lengths.
	•	Security: validate cwd equals a known project dir (has .multiterm/project.json); command is argv array (no shell string); sanitize user strings for logs; no file browsing endpoints; single-origin CORS; rate-limit input (e.g., 1 MB/s per session) and chunk pastes (≤ 32 KB per chunk).

Frontend (shadcn/ui + xterm.js)
	•	Pages: Projects (CRUD) and Dashboard (grid of terminals; 3×3 responsive).
	•	Terminal Tile: header (project, status, PID/exit code), body (xterm), footer (connection state: Live / Polling / Reconnecting). Controls: Stop, Close, Resize handle, Focus.
	•	Input: type in xterm; pastes chunked to 32 KB; maintain client-side monotonic seq; block typing if outstanding > N chunks (show tiny buffering dot).
	•	Resize: observe tile/container; throttle to 50–100 ms; send cols/rows to server.
	•	New subscriber flow: on mount: fetch scrollback?from=0 → open WS with ?from=<lastSeq>; render backlog first, then live (no dupes).

Performance Targets (enforce)
	•	First visible output ≤ 1.5 s after spawn returns.
	•	Keystroke echo ≤ 150 ms median (local loop).
	•	≥ 9 concurrent terminals render smoothly; no cross-session interference.
	•	With WS blocked, polling updates cadence ≤ 500 ms.

Self-Test (dev-only)
	•	On /readyz?selftest=1:
	1.	Create temp project dir; write .multiterm/project.json.
	2.	Spawn shell:
	•	macOS: /bin/bash -lc "echo READY; sleep 0.2; echo OK"
	•	Windows: powershell.exe -NoLogo -NoProfile -Command "Write-Output READY; Start-Sleep -Milliseconds 200; Write-Output OK"
	3.	Assert READY appears via WS; send echo hi; assert echo; stop; cleanup.
	4.	Force WS failure via env → verify polling path ≤ 500 ms cadence.

File Layout (suggested)

/app
  /client (React + shadcn)
    /components/TerminalTile.tsx
    /pages/Projects.tsx
    /pages/Dashboard.tsx
    /lib/api.ts /lib/ws.ts /state/*
    /types/domain.ts
  /server (Node TS)
    /api/projects.ts
    /api/sessions.ts
    /core/pty.ts    // shell detection, spawn, resize, kill
    /core/bus.ts    // seq, backlog, broadcast
    /core/store.ts  // project JSON I/O under .multiterm
    /core/log.ts /core/security.ts
    /selftest/index.ts
  package.json / tsconfig.json / vite.config.ts or next.config.mjs

Smart Defaults (POC)
	•	Max sessions: 12
	•	Input rate limit: 1 MB/s per session
	•	Paste max: 2 MB total, 32 KB chunks
	•	WS heartbeat: 10 s ping/pong; reconnect backoff up to 5 s
	•	ANSI: xterm.js fit + webgl addons enabled if available

Acceptance Criteria (verify)
	1.	Spawn shows running tile ≤ 1.5 s with initial output visible.
	2.	Keystrokes reflected ≤ 150 ms median.
	3.	New subscriber sees backlog then live with no duplicates.
	4.	Stop ends process; status exited; Close removes tile.
	5.	With WS blocked, polling updates ≤ 500 ms cadence.
	6.	9 concurrent terminals stream independently; input isolation holds.
	7.	Large paste (≥ 200 KB) delivered in order without reordering.

⸻

Open Questions (now resolved per your input)
	•	OS: macOS today, Windows supported (ConPTY), implemented now.
	•	Persistence: .multiterm inside each project directory.
	•	Shell: detect, fallback to bash (macOS) / PowerShell (Windows).
	•	Scrollback: 5000 lines.
	•	Everything else: smart defaults above.

⸻

Quick dev notes (for your Mac)
	•	Use node-pty; ensure xcode-select --install is set up for native module build on macOS.
	•	When you later test Windows: use a recent Node (v20+) and enable ConPTY (node-pty handles this).
	•	Security nudge: never pass a single shell string; always use argv arrays; validate cwd to the .multiterm root.

If you want, I can spit out a minimal server + client skeleton next (TypeScript, endpoints, WS handler, shadcn terminal tile) so you can pnpm dev and try it immediately.