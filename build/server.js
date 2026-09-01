"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const db_1 = require("./db");
const logger_1 = require("./logger");
const miniApp_1 = require("./miniApp");
const repositories_1 = require("./repositories");
const terrorPayService_1 = require("./services/terrorPayService");
function normalizeDepositStatus(status) {
    if (status === "COMPLETO") {
        return "CONCLUIDA";
    }
    if (status === "PENDENTE" || status === "QUEUED") {
        return "ATIVA";
    }
    if (status === "CANCELADO") {
        return "CANCELADA";
    }
    if (status === "EXPIRADO") {
        return "EXPIRADA";
    }
    if (status === "FALHA") {
        return "FALHA";
    }
    return status;
}
function extractBase64Payload(value) {
    if (!value) {
        return null;
    }
    const match = value.match(/^data:.+;base64,(.+)$/);
    return match ? match[1] : value;
}
function createServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    (0, miniApp_1.registerMiniAppRoutes)(app);
    app.get("/health", async (_req, res) => {
        const providerBalance = await terrorPayService_1.terrorPayService.getProviderBalance().catch(() => null);
        res.json({
            ok: true,
            service: "terrorpay",
            providerBalance,
        });
    });
    app.post("/webhooks/misticpay", async (req, res) => {
        const expected = config_1.appConfig.MISTICPAY_WEBHOOK_TOKEN ?? "";
        const token = String(req.query.token ?? "");
        if (expected && expected !== token) {
            (0, logger_1.persistLog)(db_1.db, "warn", "webhook.auth", "Webhook rejeitado por token invalido", {
                queryToken: token,
            });
            res.status(401).json({ ok: false });
            return;
        }
        console.log(`[webhook] recebido: ${JSON.stringify(req.body)}`);
        const result = terrorPayService_1.terrorPayService.handleWebhook(req.body);
        if (!result.handled) {
            (0, logger_1.persistLog)(db_1.db, "warn", "webhook.misticpay", "Webhook nao processado", {
                reason: result.reason,
                body: req.body,
            });
        }
        (0, logger_1.persistLog)(db_1.db, "info", "webhook.misticpay", "Webhook processado", {
            result,
            body: req.body,
        });
        res.json({ ok: true, result });
    });
    app.get("/create_payment", async (req, res) => {
        const telegramId = Number(req.query.user_id);
        const amount = Number(req.query.valor);
        const username = typeof req.query.username === "string" && req.query.username.trim()
            ? req.query.username.trim()
            : null;
        if (!Number.isFinite(telegramId)) {
            res.status(400).json({ ok: false, message: "user_id invalido" });
            return;
        }
        if (!Number.isFinite(amount) || amount < 3) {
            res.status(400).json({ ok: false, message: "valor minimo e R$ 3,00" });
            return;
        }
        try {
            const user = terrorPayService_1.terrorPayService.ensureExternalUser(telegramId, username);
            const deposit = await terrorPayService_1.terrorPayService.createDeposit(user, amount);
            (0, logger_1.persistLog)(db_1.db, "info", "api.create_payment", "Pagamento criado por endpoint publico", {
                telegramId,
                userId: user.id,
                amount,
                externalId: deposit.externalId,
            });
            res.json({
                txid: deposit.externalId,
                pixCopiaECola: deposit.copyPaste,
                qrcode_base64: extractBase64Payload(deposit.qrCodeBase64),
                status: "ATIVA",
                amount: deposit.amount,
                taxa: deposit.feeAmount,
                valor_liquido: deposit.netAmount,
            });
        }
        catch (error) {
            (0, logger_1.persistLog)(db_1.db, "error", "api.create_payment", "Falha ao criar pagamento", {
                telegramId,
                error: error.message,
            });
            res.status(500).json({ ok: false, message: error.message });
        }
    });
    app.get("/verify_payment", async (req, res) => {
        const paymentId = String(req.query.payment_id ?? "").trim();
        if (!paymentId) {
            res.status(400).json({ ok: false, message: "payment_id invalido" });
            return;
        }
        try {
            await terrorPayService_1.terrorPayService.reconcileDepositByExternalId(paymentId);
        }
        catch (error) {
            (0, logger_1.persistLog)(db_1.db, "warn", "api.verify_payment", "Falha ao reconciliar pagamento antes da consulta", {
                paymentId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        const payment = repositories_1.repositories.getDepositByExternalId(paymentId);
        if (!payment) {
            res.status(404).json({ ok: false, message: "pagamento nao encontrado" });
            return;
        }
        res.json({
            payment_id: payment.externalId,
            status_pagamento: normalizeDepositStatus(String(payment.status)),
            valor: Number(payment.amount),
            valor_liquido: Number(payment.netAmount),
        });
    });
    app.listen(config_1.appConfig.PORT, "0.0.0.0", () => {
        (0, logger_1.persistLog)(db_1.db, "info", "server.start", "Servidor HTTP iniciado", {
            port: config_1.appConfig.PORT,
        });
        console.log(`HTTP online na porta ${config_1.appConfig.PORT}`);
    });
}
