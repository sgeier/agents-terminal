"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStore = createStore;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const log_1 = require("./log");
const memory = new Map();
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
function projectFile(cwd) {
    return path_1.default.join(cwd, '.multiterm', 'project.json');
}
function createStore() {
    return {
        list() {
            return [...memory.values()];
        },
        create(p) {
            const id = (0, crypto_1.randomUUID)();
            const now = new Date().toISOString();
            const proj = { id, createdAt: now, updatedAt: now, ...p };
            // persist to .multiterm
            const dir = path_1.default.join(p.cwd, '.multiterm');
            ensureDir(dir);
            fs_1.default.writeFileSync(projectFile(p.cwd), JSON.stringify(proj, null, 2));
            memory.set(id, proj);
            log_1.logger.info('project.create', { id, name: (0, log_1.sanitize)(p.name), cwd: (0, log_1.sanitize)(p.cwd) });
            return proj;
        },
        update(id, patch) {
            const cur = memory.get(id);
            if (!cur)
                return undefined;
            const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
            memory.set(id, next);
            try {
                fs_1.default.writeFileSync(projectFile(next.cwd), JSON.stringify(next, null, 2));
            }
            catch (e) {
                log_1.logger.warn('project.update.persist_failed', { id, err: String(e) });
            }
            return next;
        },
        remove(id) {
            const cur = memory.get(id);
            if (!cur)
                return false;
            memory.delete(id);
            try {
                fs_1.default.unlinkSync(projectFile(cur.cwd));
            }
            catch (e) {
                log_1.logger.warn('project.remove.unlink_failed', { id, err: String(e) });
            }
            log_1.logger.info('project.remove', { id });
            return true;
        },
        get(id) {
            return memory.get(id);
        },
        isValidProjectDir(cwd) {
            try {
                const f = projectFile(cwd);
                if (!fs_1.default.existsSync(f))
                    return false;
                const data = JSON.parse(fs_1.default.readFileSync(f, 'utf8'));
                return typeof data?.id === 'string' && typeof data?.name === 'string';
            }
            catch {
                return false;
            }
        },
    };
}
