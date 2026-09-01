import type Database from "better-sqlite3";

export function persistLog(
  db: Database.Database,
  level: "info" | "warn" | "error",
  context: string,
  message: string,
  payload?: unknown,
): void {
  db.prepare(`
    INSERT INTO logs (level, context, message, payloadJson, createdAt)
    VALUES (@level, @context, @message, @payloadJson, @createdAt)
  `).run({
    level,
    context,
    message,
    payloadJson: payload ? JSON.stringify(payload) : null,
    createdAt: new Date().toISOString(),
  });
}
