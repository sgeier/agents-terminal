# Codex MultiTerm

Codex MultiTerm is a local developer dashboard for running multiple agent or shell sessions side by side. A TypeScript/Express server manages PTY processes while a Vite/React UI renders each terminal tile via xterm.js. Layout and session metadata live inside each project directory under `.multiterm/`, so you can keep different workspaces isolated.

## Requirements
- Node.js 20+
- npm 9+
- (Windows) PowerShell 5+ or 7 (recommended)

## Quick Start (Single Port)
```bash
git clone <repo-url>
cd codex-multiterm
npm run setup      # install server + client deps
npm run serve      # build client + server and host everything on http://localhost:3001
```

Open http://localhost:3001, import a project directory, and start Codex/Claude/shell sessions from the toolbar. `npm run serve` will rebuild automatically if you re-run it; restart after code changes.

### Live Development (optional)
If you prefer hot reloading during development, run the client and server separately:
```bash
make setup
make run-server   # terminal 1 → API + WS on http://localhost:3001
make run-ui       # terminal 2 → Vite dev server on http://localhost:5173
```
The Vite dev server proxies API calls back to port 3001.

## Environment Notes
- macOS/Linux shells follow `process.env.SHELL`; bash/zsh/fish run as login shells.
- Windows defaults to `powershell.exe -NoLogo -NoProfile`. If the Codex or Claude CLI isn’t on `PATH`, set `CODEX_BIN` / `CLAUDE_BIN` (or `MULTITERM_*` variants) to the full executable path.
- Session state persists per project under `.multiterm/`. These directories are gitignored by default.

## Handy Commands
| Goal                | Run this command                            |
|---------------------|---------------------------------------------|
| Install deps        | `npm run setup`
| Single-port bundle  | `npm run serve`
| Server dev mode     | `make run-server`
| UI dev mode         | `make run-ui`
| Build for release   | `make build`
| Clean artifacts     | `make clean`

Each `make` target maps to an underlying `npm --prefix …` script; check `docs/README.md` if you need the raw commands.

## Tests & Linting
At the moment linting/tests are TODO; see `docs/TODO.md` for planned coverage. Contributions should include relevant unit or integration tests when frameworks are in place.

## License
MIT (see `LICENSE` if present) or insert license text.
