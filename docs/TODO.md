# TODO / Roadmap

- Voice toggle (global and per-terminal)
  - Add a global UI setting to enable/disable brief voice summaries at the end of each agent turn.
  - Add a per-terminal toggle in `app/client/src/components/TerminalTile.tsx` so individual sessions can opt in/out.
  - Persistence: store global preference (e.g., `mt.voice`) and per-project/per-session preference (e.g., `mt.<projectId>.voice`) in `localStorage`.
  - Behavior: when disabled, suppress the TTS call entirely on the client; still respect `VOICE_UPDATES=off` and `CI` env on the server.
  - Defaults: keep current default (voice on) unless `VOICE_UPDATES=off` or `CI`.
  - Notes: avoid reading secrets/logs aloud; only short high-level summaries.

---

NPM Quick Actions per Terminal

- Goal: Each terminal shows a small “NPM” box with available commands for the terminal’s working directory.
- Detection:
  - Read package.json in the session cwd and extract:
    - npm scripts (scripts object keys, e.g., start, build, test)
    - common npm commands (run <script>, install, ci) – show only scripts if present.
  - Fallback: if no package.json found, hide the box.
- UI/UX:
  - In TerminalTile header or a collapsible popover, show “NPM” button → reveals a list of actions.
  - Actions include: npm run <script> for each script; npm install; npm ci.
  - Clicking an action spawns a new terminal session in the same cwd running the selected command.
  - Visually link the origin terminal and spawned process: assign a shared color tag and draw a small colored indicator on both tiles (legend in footer).
  - Optional: show live status on the origin tile (e.g., “linked: running npm run start in #abcd”).
- Behavior:
  - Spawn via existing Sessions API with argv array (no shell strings), e.g., ["npm", "run", "start"].
  - Set a parentSessionId on the new session (requires server field) or track a client-side link map keyed by session.id.
  - Limit: max 1 linked color per origin session (reuse for subsequent spawned npm tasks).
- Persistence:
  - Store link metadata in `.multiterm/sessions.json` (server tracker) by adding optional `parentId` and `linkColor` fields for created sessions.
  - Client keeps a map sessionId → linkColor to render indicators.
- API:
  - Add optional `parentId` and `linkColor` to POST /api/sessions body and response.
  - Server-side validation: `parentId` must be an existing open session from a known project; `linkColor` sanitized.
- Styling:
  - Small colored left border or badge dot in the tile header, same color on both linked tiles.
  - Accessible contrast and minimal visual noise.
- Testing:
  - Unit: extraction of scripts from package.json.
  - E2E: spawn script, verify new session created with parentId and color; both tiles render the shared indicator.
