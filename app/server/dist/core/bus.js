"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionBus = createSessionBus;
const ws_1 = require("ws");
const log_1 = require("./log");
const metrics_1 = require("./metrics");
function createSessionBus(sessionId) {
    let seq = 0;
    const frames = [];
    let lines = 0;
    const subscribers = new Set();
    function dropOverflow() {
        // Keep ≤5000 lines by dropping old frames
        let dropped = 0;
        while (lines > 5000 && frames.length > 0) {
            const old = frames.shift();
            const data = old ? Buffer.from(old.dataBase64, 'base64').toString('utf8') : '';
            const count = (data.match(/\n/g) || []).length || 1;
            lines -= count;
            dropped += count;
            if (lines < 0)
                lines = 0;
        }
        if (dropped > 0)
            metrics_1.metrics.addDroppedLines(dropped);
    }
    function broadcast(frame) {
        for (const ws of subscribers) {
            try {
                if (ws.readyState === ws_1.WebSocket.OPEN)
                    ws.send(JSON.stringify(frame));
            }
            catch (e) {
                log_1.logger.warn('ws.send_failed', { err: String(e) });
            }
        }
    }
    return {
        addSubscriber(ws, fromSeq) {
            subscribers.add(ws);
            if (typeof fromSeq === 'number') {
                const backlog = frames.filter((f) => f.seq > fromSeq);
                for (const f of backlog) {
                    try {
                        if (ws.readyState === ws_1.WebSocket.OPEN)
                            ws.send(JSON.stringify(f));
                    }
                    catch (e) {
                        log_1.logger.warn('ws.send_failed', { err: String(e) });
                    }
                }
            }
        },
        removeSubscriber(ws) {
            subscribers.delete(ws);
        },
        push(data) {
            const ts = Date.now();
            const dataUtf8 = data.toString('utf8');
            const lineInc = (dataUtf8.match(/\n/g) || []).length || 1;
            lines += lineInc;
            try {
                metrics_1.metrics.addOutputBytes(Buffer.byteLength(data));
            }
            catch { }
            const frame = {
                sessionId,
                seq: ++seq,
                ts,
                dataBase64: data.toString('base64'),
            };
            frames.push(frame);
            dropOverflow();
            broadcast(frame);
            return frame;
        },
        latestSeq() {
            return seq;
        },
        lineCount() {
            return lines;
        },
        getFrom(fromSeq) {
            return frames.filter((f) => f.seq > fromSeq);
        },
    };
}
