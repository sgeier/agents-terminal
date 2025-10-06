# Codex MultiTerm Tech Stack

This document captures the primary technologies used across the project after the shadcn/Tailwind migration.

## High-Level Architecture

- **Server**: TypeScript Node.js (Express) app located under `app/server`. It exposes REST + WebSocket endpoints for project/session management and proxies PTY streams through `node-pty`.
- **Client**: React (Vite) application under `app/client`. The UI is built with TypeScript, Tailwind CSS, and shadcn/ui components running in strict mode.
- **Shell Integration**: Sessions spawn shells or Codex commands via PTYs. Scrollback and status are managed in memory with persistence under `.multiterm/`.

## Server Stack

| Area              | Technology / Notes |
| ----------------- | ------------------ |
| Runtime           | Node.js (>=18), TypeScript |
| Web framework     | Express + http/ws for REST and WebSocket streams |
| PTY integration   | `node-pty` with fallbacks to `child_process.spawn` |
| Persistence       | Lightweight JSON stores (`project.json`, `sessions.json`) under per-project `.multiterm/` directories |
| Self-test         | `/readyz?selftest=1` endpoint verifying minimal spawn/stream path |

## Client Stack

| Area              | Technology / Notes |
| ----------------- | ------------------ |
| Build tooling     | Vite 5 + TypeScript |
| UI library        | React 18 with shadcn/ui and Radix primitives |
| Styling           | Tailwind CSS 3 (JIT) with `tailwind-merge` and custom tokens defined in `src/styles/globals.css` |
| State             | React hooks + localStorage for preferences |
| Terminal rendering| `xterm.js` + `@xterm/addon-fit` |

## Component Library Setup

- `app/client/components.json` captures shadcn settings (`style: new-york`, aliases, Tailwind config path).
- Core UI primitives live under `app/client/src/components/ui/` (button, card, dialog, input, scroll-area, badge).
- Global Tailwind tokens reside in `app/client/src/styles/globals.css`.

## Scripts & Commands

| Command                        | Description |
| ------------------------------ | ----------- |
| `make setup`                   | Installs server + client dependencies |
| `make run-server` / `make run-ui` | Start dev servers (server at :3001, client at :5173) |
| `npm run build:ui`             | Production build of the client (from repo root) |
| `npm run build:server`         | Compiles server TypeScript |
| `make build`                   | Builds both client and server for single-port mode |

## Styling Guidelines

- Tailwind tokens map to HSL values for light/dark via CSS variables.
- shadcn components use `cn()` helper (`app/client/src/lib/utils.ts`) to merge classes.
- Dark mode is toggled via `.dark` class on `<html>` and handled in `globals.css`.

## Frontend/Backend Contract

- Projects and sessions mutate via `@/lib/api` helpers, calling the server REST endpoints.
- WebSocket streaming is handled by `@/lib/ws`; terminals broadcast input via `api.input`.
- No server logic changed during the shadcn migration; updates were isolated to client styling and layout. Ensure PTY handling remains untouched when modifying UI.

## Future Considerations

- Component library additions should be generated via `npx shadcn add <component>` to keep styling consistent.
- When adjusting Tailwind tokens, update both light and dark palettes to avoid mismatches.
- For further theming, consider using CSS variables defined in `globals.css` and avoid inline colors.

