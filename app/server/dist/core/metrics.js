"use strict";
// Lightweight in-memory metrics for summary views (no Prometheus dependency)
// Counters reset on process restart.
Object.defineProperty(exports, "__esModule", { value: true });
exports.metrics = void 0;
const m = {
    sessionsRunning: 0,
    sessionsStarting: 0,
    sessionsExited: 0,
    spawnsTotal: 0,
    spawnsPty: 0,
    spawnsStdio: 0,
    exitsTotal: 0,
    exitsWithError: 0,
    firstOutCount: 0,
    firstOutSum: 0,
    firstOutMin: Number.POSITIVE_INFINITY,
    firstOutMax: 0,
    outBytes: 0,
    inBytes: 0,
    linesDropped: 0,
    wsConnections: 0,
    wsConnectTotal: 0,
    wsDisconnectTotal: 0,
};
exports.metrics = {
    // Sessions
    incSpawn(pty) {
        m.spawnsTotal += 1;
        if (pty)
            m.spawnsPty += 1;
        else
            m.spawnsStdio += 1;
        m.sessionsStarting += 1;
    },
    onFirstOutput(ms) {
        m.firstOutCount += 1;
        m.firstOutSum += ms;
        if (ms < m.firstOutMin)
            m.firstOutMin = ms;
        if (ms > m.firstOutMax)
            m.firstOutMax = ms;
    },
    onRunningTransition() {
        if (m.sessionsStarting > 0)
            m.sessionsStarting -= 1;
        m.sessionsRunning += 1;
    },
    onExit(code) {
        if (m.sessionsRunning > 0)
            m.sessionsRunning -= 1;
        m.sessionsExited += 1;
        m.exitsTotal += 1;
        if (code && code !== 0)
            m.exitsWithError += 1;
    },
    // IO
    addOutputBytes(n) { m.outBytes += n; },
    addInputBytes(n) { m.inBytes += n; },
    addDroppedLines(n) { if (n > 0)
        m.linesDropped += n; },
    // WS
    wsConnect() { m.wsConnections += 1; m.wsConnectTotal += 1; },
    wsDisconnect() { if (m.wsConnections > 0)
        m.wsConnections -= 1; m.wsDisconnectTotal += 1; },
    summary() {
        const avg = m.firstOutCount ? m.firstOutSum / m.firstOutCount : 0;
        return {
            sessions: {
                running: m.sessionsRunning,
                starting: m.sessionsStarting,
                exited: m.sessionsExited,
                spawns: { total: m.spawnsTotal, pty: m.spawnsPty, stdio: m.spawnsStdio },
                exits: { total: m.exitsTotal, withError: m.exitsWithError },
                firstOutputMs: {
                    count: m.firstOutCount,
                    avg: Math.round(avg),
                    min: m.firstOutCount ? Math.round(m.firstOutMin) : 0,
                    max: Math.round(m.firstOutMax),
                },
            },
            io: {
                outputBytes: m.outBytes,
                inputBytes: m.inBytes,
                ringbufferLinesDropped: m.linesDropped,
            },
            ws: {
                connections: m.wsConnections,
                connectTotal: m.wsConnectTotal,
                disconnectTotal: m.wsDisconnectTotal,
            },
        };
    },
};
