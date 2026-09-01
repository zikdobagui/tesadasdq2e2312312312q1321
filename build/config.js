"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
(0, dotenv_1.config)();
function readDiscloudAppId() {
    const configPath = node_path_1.default.resolve(process.cwd(), "discloud.config");
    if (!node_fs_1.default.existsSync(configPath)) {
        return null;
    }
    const content = node_fs_1.default.readFileSync(configPath, "utf8");
    const line = content
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find((value) => /^ID\s*=/i.test(value));
    const id = line?.split("=").slice(1).join("=").trim();
    if (!id || /^(0|none|null)$/i.test(id)) {
        return null;
    }
    return id.replace(/\.discloud\.app$/i, "").trim();
}
/** Aceita URL completa ou host:porta sem esquema; fallback local para dev. */
function normalizePublicBaseUrl(raw, port, discloudAppId) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
        if (discloudAppId) {
            return `https://${discloudAppId}.discloud.app`;
        }
        return `http://127.0.0.1:${port}`;
    }
    let candidate = trimmed;
    if (!/^https?:\/\//i.test(candidate)) {
        const host = candidate.split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
        const isLocalHost = host === "localhost" ||
            host === "0.0.0.0" ||
            host === "::1" ||
            host.startsWith("127.");
        candidate = `${isLocalHost ? "http" : "https"}://${candidate}`;
    }
    try {
        const u = new URL(candidate);
        const host = u.hostname.toLowerCase();
        const isLocalHost = host === "localhost" ||
            host === "0.0.0.0" ||
            host === "::1" ||
            host.startsWith("127.");
        if (!isLocalHost && u.protocol === "http:") {
            u.protocol = "https:";
        }
        return u.href.replace(/\/$/, "");
    }
    catch {
        return `http://127.0.0.1:${port}`;
    }
}
const DEFAULT_MISTIC_API = "https://api.misticpay.com/api";
function normalizeMisticApiBaseUrl(raw) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
        return DEFAULT_MISTIC_API;
    }
    let candidate = trimmed;
    if (!/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
    }
    try {
        return new URL(candidate).href.replace(/\/$/, "");
    }
    catch {
        return DEFAULT_MISTIC_API;
    }
}
const envSchema = zod_1.z.object({
    BOT_TOKEN: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().default(8080),
    BASE_URL: zod_1.z.string().optional().default(""),
    ADMIN_IDS: zod_1.z.string().default(""),
    MISTICPAY_CLIENT_ID: zod_1.z.string().min(1),
    MISTICPAY_CLIENT_SECRET: zod_1.z.string().min(1),
    MISTICPAY_BASE_URL: zod_1.z.string().optional().default(""),
    MISTICPAY_WEBHOOK_TOKEN: zod_1.z.string().optional(),
    DEFAULT_FEE_PERCENT: zod_1.z.coerce.number().min(0).max(100).default(3),
    DATABASE_PATH: zod_1.z.string().default("./data/terrorpay.db"),
});
const env = envSchema.parse(process.env);
const BASE_URL = normalizePublicBaseUrl(env.BASE_URL, env.PORT, readDiscloudAppId());
const MISTICPAY_BASE_URL = normalizeMisticApiBaseUrl(env.MISTICPAY_BASE_URL);
exports.appConfig = {
    ...env,
    BASE_URL,
    MISTICPAY_BASE_URL,
    ADMIN_IDS: env.ADMIN_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    DATABASE_PATH: node_path_1.default.resolve(process.cwd(), env.DATABASE_PATH),
    WEBHOOK_URL: `${BASE_URL.replace(/\/$/, "")}/webhooks/misticpay`,
};
