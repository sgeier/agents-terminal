import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { projectsRouter } from './api/projects';
import { sessionsRouter } from './api/sessions';
import { selftestRouter } from './selftest';
import { logger } from './core/log';
import { shutdownAllSessions } from './api/sessions';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
process.title = 'codex';

// Basic middleware
app.use(express.json({ limit: '2mb' }));

// Single-origin CORS with sensible localhost defaults.
const defaultOrigins = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:3001', 'http://127.0.0.1:3001',
  'http://localhost:3002', 'http://127.0.0.1:3002',
];
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowList = envOrigins.length ? envOrigins : defaultOrigins;
const corsOpts: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser or same-origin
    cb(null, allowList.includes(origin));
  },
};
app.use(cors(corsOpts));
app.options('*', cors(corsOpts));

// Routers
app.use('/api/projects', projectsRouter());
app.use('/api/sessions', sessionsRouter({ wss }));
// metrics router removed
app.use('/', selftestRouter());

// Serve built client if present
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  logger.info('server.listening', { port: PORT });
});

// WebSocket heartbeat
setInterval(() => {
  for (const client of wss.clients) {
    try { (client as any).ping?.(); } catch {}
  }
}, 10_000);

// Graceful shutdown: try to stop all live sessions
import { setImmediate as defer } from 'timers';
import { logger as _log } from './core/log';
import { } from './api/sessions';
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  _log.info('server.shutdown');
  try { shutdownAllSessions(); } catch {}
  try { wss.close(); } catch {}
  try { server.close(); } catch {}
  // Close after a short delay to allow session exit handlers to run
  setTimeout(() => process.exit(0), 1000);
}
