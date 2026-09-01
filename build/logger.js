"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistLog = persistLog;
function persistLog(db, level, context, message, payload) {
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
