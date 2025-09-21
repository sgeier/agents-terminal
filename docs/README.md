# Codex MultiTerm — Dev Guide

This repo provides a local web app to spawn and interact with multiple terminal sessions per project, optimized for Codex. It runs a TypeScript Node server with PTY support and a React + xterm.js client. No global DB — all persistence lives inside each project directory under `.multiterm/`.

## Quickstart

- Requirements: Node 18+ (Windows 20+), macOS needs Xcode CLT for `node-pty`.
- Setup: `make setup`
- Dev: in separate terminals
  - Server: `make run-server` (http://localhost:3001)
  - Client: `make run-ui` (http://localhost:5173)
- Single-port (serve built UI from server):
  - `make build && node app/server/dist/index.js`
  - Open http://localhost:3001

Self-test: `curl 'http://localhost:3001/readyz?selftest=1'` → `{ ok: true, ... }`.

## UI Basics

- Sessions-first dashboard shows all spawned agents across projects.
- Top bar:
  - Project select (persisted), Projects… panel to configure/add/import projects.
  - Spawn: runs `codex` in the selected project.
  - New Terminal: spawns a shell in the selected project.
  - Theme toggle: light/dark, persisted.
- Tiles:
  - Header shows `project • command • pid` and status.
  - Controls: width drag (right edge), height drag (bottom edge), corner drag for both; A− / A+ adjust font size; Close kills and removes.
  - Footer shows connection state (Live / Polling / Reconnecting / Closed) and PTY info.
  - Backlog first, then live stream. Automatic WS reconnect with 500 ms polling fallback.

## Persistence

- Per project (in the project directory):
  - `.multiterm/project.json` — project metadata.
  - `.multiterm/sessions.json` — tracked sessions (id, pid, command, status, timestamps).
- Per browser (localStorage):
  - `mt.selectedProjectId`, `mt.theme` — UI prefs.
  - `mt.cwds` — known project directories to auto-import.
  - `mt.<projectId>.fontSize`, `mt.<projectId>.termHeight`, `mt.<projectId>.span` — per-project terminal preferences.

## Server

- Transport: Express REST + WebSocket (single port).
- PTY: `node-pty` with shell detection; fallback to `child_process.spawn` (stdio).
- Scrollback: in-memory ring buffer ≤ 5000 lines per session.
- CORS: defaults to localhost ports (5173, 3000–3002). Override with `CORS_ORIGIN` (comma-separated).
- Env: `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`.

### REST Endpoints

- Projects
  - `GET /api/projects` → Project[]
  - `POST /api/projects` { name, cwd, type, autostart? } → Project
  - `PATCH /api/projects/:id` → Project
  - `DELETE /api/projects/:id` → { ok: true }
  - `POST /api/projects/import` { cwd } → Project (reads `.multiterm/project.json`)

- Sessions
  - `POST /api/sessions` { projectId?, cwd?, command? } → TerminalSession
  - `GET /api/sessions` → TerminalSession[]
  - `GET /api/sessions/:id` → TerminalSession
  - `POST /api/sessions/:id/stop` → { ok: true } (not used by UI; Close kills)
  - `DELETE /api/sessions/:id` → { ok: true } (kill + cleanup)
  - `POST /api/sessions/:id/resize` { cols, rows } → { ok: true }
  - `GET /api/sessions/:id/scrollback?from=<seq>` → { from, to, frames }
  - `POST /api/sessions/:id/input` InputChunk → { ok: true }
  - `GET /api/sessions/opened/all` → { sessions: TrackedSession[] } (from `.multiterm/sessions.json`)

- Streaming
  - `WS /api/sessions/:id/stream?from=<lastSeq>`
  - Server→Client: OutputFrame; Client→Server: InputChunk (32 KB chunks; 1 MB/s rate).
  - Fallback: if first WS byte not seen in 1.5 s, client polls every 500 ms.

## Notes & Limits

- Max sessions shown: 12 (UI trims oldest on spawn).
- Input rate limit: 1 MB/s per session; chunked pastes ≤ 32 KB per chunk.
- Performance targets: first output ≤ 1.5s, keystroke echo ≤ 150 ms (local), 9+ concurrent terminals.
- Security: validate `cwd` to known projects; no shell-string commands (argv only); structured logs; single-origin CORS.

## Development

- `make setup` — install server and client deps.
- `make run-server`, `make run-ui` — dev servers.
- `make build` — builds server TS and client assets; server will serve client from `app/client/dist`.

