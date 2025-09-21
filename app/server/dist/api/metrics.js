"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRouter = metricsRouter;
const express_1 = require("express");
const metrics_1 = require("../core/metrics");
function metricsRouter() {
    const r = (0, express_1.Router)();
    r.get('/metrics-summary', (_req, res) => {
        try {
            res.json(metrics_1.metrics.summary());
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    return r;
}
