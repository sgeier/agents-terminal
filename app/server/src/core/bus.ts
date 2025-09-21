import { WebSocket } from 'ws';
import { OutputFrame } from '../types/domain';
import { logger } from './log';

interface SessionBus {
  addSubscriber(ws: WebSocket, fromSeq?: number): void;
  removeSubscriber(ws: WebSocket): void;
  push(data: Buffer): OutputFrame;
  latestSeq(): number;
  lineCount(): number;
  getFrom(fromSeq: number): OutputFrame[];
}

export function createSessionBus(sessionId: string): SessionBus {
  let seq = 0;
  const frames: OutputFrame[] = [];
  let lines = 0;
  const subscribers = new Set<WebSocket>();

  function dropOverflow() {
    // Keep ≤5000 lines by dropping old frames
    while (lines > 5000 && frames.length > 0) {
      const old = frames.shift();
      const data = old ? Buffer.from(old.dataBase64, 'base64').toString('utf8') : '';
      const count = (data.match(/\n/g) || []).length || 1;
      lines -= count;
      if (lines < 0) lines = 0;
    }
  }

  function broadcast(frame: OutputFrame) {
    for (const ws of subscribers) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
      } catch (e) {
        logger.warn('ws.send_failed', { err: String(e) });
      }
    }
  }

  return {
    addSubscriber(ws: WebSocket, fromSeq?: number) {
      subscribers.add(ws);
      if (typeof fromSeq === 'number') {
        const backlog = frames.filter((f) => f.seq > fromSeq);
        for (const f of backlog) {
          try {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f));
          } catch (e) {
            logger.warn('ws.send_failed', { err: String(e) });
          }
        }
      }
    },
    removeSubscriber(ws: WebSocket) {
      subscribers.delete(ws);
    },
    push(data: Buffer) {
      const ts = Date.now();
      const dataUtf8 = data.toString('utf8');
      const lineInc = (dataUtf8.match(/\n/g) || []).length || 1;
      lines += lineInc;
      const frame: OutputFrame = {
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
    getFrom(fromSeq: number) {
      return frames.filter((f) => f.seq > fromSeq);
    },
  };
}

