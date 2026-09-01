import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

function readDiscloudAppId(): string | null {
  const configPath = path.resolve(process.cwd(), "discloud.config");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, "utf8");
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
function normalizePublicBaseUrl(raw: string | undefined, port: number, discloudAppId: string | null): string {
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
    const isLocalHost =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("127.");

    candidate = `${isLocalHost ? "http" : "https"}://${candidate}`;
  }

  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("127.");

    if (!isLocalHost && u.protocol === "http:") {
      u.protocol = "https:";
    }

    return u.href.replace(/\/$/, "");
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

const DEFAULT_MISTIC_API = "https://api.misticpay.com/api";

function normalizeMisticApiBaseUrl(raw: string | undefined): string {
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
  } catch {
    return DEFAULT_MISTIC_API;
  }
}

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  PORT: z.coerce.number().default(8080),
  BASE_URL: z.string().optional().default(""),
  ADMIN_IDS: z.string().default(""),
  MISTICPAY_CLIENT_ID: z.string().min(1),
  MISTICPAY_CLIENT_SECRET: z.string().min(1),
  MISTICPAY_BASE_URL: z.string().optional().default(""),
  MISTICPAY_WEBHOOK_TOKEN: z.string().optional(),
  DEFAULT_FEE_PERCENT: z.coerce.number().min(0).max(100).default(3),
  DATABASE_PATH: z.string().default("./data/terrorpay.db"),
});

const env = envSchema.parse(process.env);
const BASE_URL = normalizePublicBaseUrl(env.BASE_URL, env.PORT, readDiscloudAppId());
const MISTICPAY_BASE_URL = normalizeMisticApiBaseUrl(env.MISTICPAY_BASE_URL);

export const appConfig = {
  ...env,
  BASE_URL,
  MISTICPAY_BASE_URL,
  ADMIN_IDS: env.ADMIN_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)),
  DATABASE_PATH: path.resolve(process.cwd(), env.DATABASE_PATH),
  WEBHOOK_URL: `${BASE_URL.replace(/\/$/, "")}/webhooks/misticpay`,
};
