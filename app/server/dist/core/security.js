"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectCwd = validateProjectCwd;
exports.isValidArgv = isValidArgv;
const path_1 = __importDefault(require("path"));
function validateProjectCwd(store, cwd) {
    // must have .multiterm/project.json and be absolute path
    if (!path_1.default.isAbsolute(cwd))
        return false;
    return store.isValidProjectDir(cwd);
}
function isValidArgv(argv) {
    return Array.isArray(argv) && argv.every((x) => typeof x === 'string');
}
