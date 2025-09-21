"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const projects_1 = require("./api/projects");
const sessions_1 = require("./api/sessions");
const selftest_1 = require("./selftest");
const log_1 = require("./core/log");
const sessions_2 = require("./api/sessions");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
process.title = 'codex';
// Basic middleware
app.use(express_1.default.json({ limit: '2mb' }));
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
const corsOpts = {
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true); // non-browser or same-origin
        cb(null, allowList.includes(origin));
    },
};
app.use((0, cors_1.default)(corsOpts));
app.options('*', (0, cors_1.default)(corsOpts));
// Routers
app.use('/api/projects', (0, projects_1.projectsRouter)());
app.use('/api/sessions', (0, sessions_1.sessionsRouter)({ wss }));
// metrics router removed
app.use('/', (0, selftest_1.selftestRouter)());
// Serve built client if present
const clientDist = path_1.default.resolve(__dirname, '../../client/dist');
if (fs_1.default.existsSync(clientDist)) {
    app.use(express_1.default.static(clientDist));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(clientDist, 'index.html'));
    });
}
const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
    log_1.logger.info('server.listening', { port: PORT });
});
// WebSocket heartbeat
setInterval(() => {
    for (const client of wss.clients) {
        try {
            client.ping?.();
        }
        catch { }
    }
}, 10000);
const log_2 = require("./core/log");
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
let shuttingDown = false;
function shutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    log_2.logger.info('server.shutdown');
    try {
        (0, sessions_2.shutdownAllSessions)();
    }
    catch { }
    try {
        wss.close();
    }
    catch { }
    try {
        server.close();
    }
    catch { }
    // Close after a short delay to allow session exit handlers to run
    setTimeout(() => process.exit(0), 1000);
}
