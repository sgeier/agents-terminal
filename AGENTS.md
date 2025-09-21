# Repository Guidelines

Concise guidance for contributing to this agent‑focused terminal project. Follow these conventions to keep changes simple to review and easy to run locally.

## Project Structure & Module Organization
- `src/`: App/agent code by feature (e.g., `src/cli`, `src/core`, `src/adapters`).
- `tests/`: Mirrors `src/` paths (e.g., `tests/cli`, `tests/core`).
- `scripts/`: Dev utilities (setup, lint, release).
- `docs/`: Quickstart, usage, and diagrams.
- `examples/` and `assets/`: Small runnable samples and fixtures.

Example:
```
src/
  cli/
  core/
tests/
  core/
```

## Build, Test, and Development Commands
Prefer Makefile targets as a single entrypoint:
- `make setup` — install deps (e.g., `npm ci` or `pip install -e .[dev]`).
- `make run` — run the local CLI/app.
- `make test` — run tests with coverage.
- `make lint` — lint and format checks.
If Makefile isn’t available, defaults: Node (`npm test`, `npm run dev`, `npm run lint`) or Python (`pytest -q`, `ruff check .`, `black --check .`). See `docs/README.md` for details.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (JS/TS/JSON/YAML), 4 spaces (Python).
- Naming: camelCase (funcs/vars), PascalCase (classes/types), kebab-case (CLI names, folders).
- Formatting/Linting: Prettier + ESLint (JS/TS) or Black + Ruff (Python). Keep files small and cohesive.

## Testing Guidelines
- Frameworks: Vitest/Jest (JS/TS) or Pytest (Python).
- Structure: tests mirror `src/`; name tests `*.test.ts` or `test_*.py`.
- Coverage: target ≥80% lines/branches for changed code; include error paths.
- Run locally before PRs: `make test` (or language defaults above).

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat(cli): add streaming preamble hook`).
- PRs: clear description, linked issues, steps to validate, relevant logs/screenshots. Keep diffs focused; update docs/tests with code.

## Security & Configuration Tips
- Never commit secrets; use `.env` and add `.env.example`.
- Minimize token permissions; rotate regularly.
- Avoid real network calls in tests; mock external services.

---

# Project: Codex MultiTerm (What This App Does)

A local web app to spawn and interact with multiple terminal sessions per project, optimized for Codex workflows. One Node server (Express + WebSocket) powers PTY shells via `node-pty` with a React + xterm.js client. No global DB: every project stores its own metadata under `.multiterm/`.

## High‑Level Flow
- User creates/imports a project by absolute `cwd`. The server writes `.multiterm/project.json` in that directory; the client remembers the path in `localStorage`.
- User spawns sessions (shell or `codex`). The server starts a PTY (or falls back to `child_process.spawn`) and streams output frames. The client renders backlog first, then live output. Input is sent either over WS or via REST as a fallback.
- All open sessions render on the dashboard. Tiles can be resized (width/height), and font size can be adjusted — all preferences persist per project.
- Sessions are tracked in `.multiterm/sessions.json` to aid cleanup/inspection.

## Repository Layout (app code)
- `app/server` — TypeScript Node server
  - `src/core/pty.ts` — shell detection, spawn, resize, kill
  - `src/core/bus.ts` — output frames, ring buffer (≤ 5000 lines), broadcast
  - `src/core/store.ts` — Project store + JSON I/O in `.multiterm`
  - `src/core/tracker.ts` — `.multiterm/sessions.json` start/exit tracking
  - `src/api/projects.ts` — Projects CRUD + import
  - `src/api/sessions.ts` — Session lifecycle + scrollback + input + WS
  - `src/selftest/index.ts` — `/readyz?selftest=1` minimal e2e
  - `src/index.ts` — Express app, WS server, CORS, static client
- `app/client` — Vite + React + xterm.js UI
  - `src/components/TerminalTile.tsx` — a terminal tile with streaming, resizing, font size controls
  - `src/pages/Projects.tsx` — quick config/import UI
  - `src/pages/Dashboard.tsx` — sessions grid (12‑column CSS grid)
  - `src/lib/api.ts` — REST client helpers
  - `src/lib/ws.ts` — WS client with fallback polling

## Run & Dev
- `make setup` — install server and client deps
- Dev (two processes):
  - Server: `make run-server` (http://localhost:3001)
  - Client: `make run-ui` (http://localhost:5173)
- Single‑port (server serves built client):
  - `make build && node app/server/dist/index.js` (http://localhost:3001)
- Self‑test: `curl 'http://localhost:3001/readyz?selftest=1'` → `{ ok: true, ... }`

## Environment & Defaults
- macOS shell: respect `process.env.SHELL`, fallback `/bin/bash -l`
- Windows shell: `powershell.exe -NoLogo -NoProfile`, fallback `cmd.exe`
- Max sessions shown in UI: 12
- Scrollback: ≤ 5000 lines (ring buffer per session)
- CORS: allows localhost 5173/3000/3001/3002 by default; override `CORS_ORIGIN` (comma‑separated)
- WS heartbeat: 10 s

## Data & Persistence
- Per project directory (`cwd`):
  - `.multiterm/project.json` — Project metadata `{ id, name, cwd, type, autostart?, createdAt, updatedAt }`
  - `.multiterm/sessions.json` — tracked sessions `{ id, pid, command[], cwd, status, createdAt, exitedAt?, exitCode? }`
- Browser `localStorage`:
  - `mt.cwds` — array of known cwds to auto‑import
  - `mt.selectedProjectId`, `mt.theme`, `mt.sync`
  - `mt.<projectId>.fontSize`, `mt.<projectId>.termHeight`, `mt.<projectId>.span`

## Server Behavior (ins & outs)
- Spawn (`node-pty` → fallback `child_process.spawn`): logs sizes only (no raw data). Sets status `starting` then `running` on first output.
- Resize: `POST /api/sessions/:id/resize { cols, rows }` calls PTY resize (ignored for stdio fallback)
- Output frames: in‑memory per session, dedup on resume via monotonic `seq`
- Input: WS InputChunk or REST `/input` with 32 KB chunk max; session‑level rate limit ~1 MB/s
- Exit: mark `exited`, keep scrollback; tracker persists in `.multiterm/sessions.json`
- Logging: structured JSON (spawn/exit, WS connect/disconnect, IO sizes, fallbacks)
- Security: validate `cwd` is a known project dir (has `.multiterm/project.json`); enforce argv array (no shell strings); single‑origin CORS

## API Summary
- Projects
  - `GET /api/projects`
  - `POST /api/projects` `{ name, cwd, type, autostart? }`
  - `PATCH /api/projects/:id`
  - `DELETE /api/projects/:id`
  - `POST /api/projects/import` `{ cwd }` → read `.multiterm/project.json`
- Sessions
  - `POST /api/sessions` `{ projectId?, cwd?, command? }`
  - `GET /api/sessions` / `GET /api/sessions/:id`
  - `DELETE /api/sessions/:id` (kill + remove)
  - `POST /api/sessions/:id/stop` (TERM → KILL after 3s)
  - `POST /api/sessions/:id/resize` `{ cols, rows }`
  - `GET /api/sessions/:id/scrollback?from=<seq>`
  - `POST /api/sessions/:id/input` InputChunk
  - `GET /api/sessions/opened/all` (from trackers)
- Streaming
  - `WS /api/sessions/:id/stream?from=<lastSeq>`
  - Fallback polling every 500 ms if no first WS byte within 1.5 s

## Client Behavior (ins & outs)
- Dashboard always shows all sessions; project select only affects where Spawn/New Terminal run.
- A terminal tile:
  - Backlog render (scrollback from 0), then WS live from `?from=lastSeq`
  - Connection footer: Live / Polling / Reconnecting / Closed
  - Resize: drag right (width, snaps to 12‑col grid), drag bottom (height), corner for both; font size A−/A+
  - Close: DELETE session (kills process) and remove tile
  - Optional Sync: when On, your keystrokes mirror to all other open sessions (best‑effort REST fallback)

## Performance Targets
- First visible output ≤ 1.5 s after spawn
- Keystroke echo ≤ 150 ms median (local loop)
- With WS blocked, polling cadence ≤ 500 ms

## Known Caveats
- Sync broadcast can add typing lag with many terminals (planned batching/fan‑out). Toggle Off if you notice latency.
- Some GPUs show better perf with Canvas than WebGL; we can add a renderer toggle if needed.

## Troubleshooting
- Projects select empty on first load: we auto‑import cwds from `localStorage`; ensure the configured path still contains `.multiterm/project.json`.
- CORS errors in console: set `CORS_ORIGIN=http://localhost:5173` (or your port) and restart server.
- Test server path: `curl 'http://localhost:3001/readyz?selftest=1'`
- PTY build on macOS: ensure `xcode-select --install` is present for `node-pty`.

## Contributing Notes
- Keep diffs focused; update docs and UI strings when changing endpoints.
- Prefer adding small, well‑named helpers in `core/*` to keep API routes small.
- Follow Conventional Commits and the repo conventions above.
