import { Router } from 'express';
import { metrics } from '../core/metrics';

export function metricsRouter() {
  const r = Router();
  r.get('/metrics-summary', (_req, res) => {
    try {
      res.json(metrics.summary());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  return r;
}

