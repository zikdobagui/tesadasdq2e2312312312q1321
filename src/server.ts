import express from "express";
import { appConfig } from "./config";
import { db } from "./db";
import { persistLog } from "./logger";
import { registerMiniAppRoutes } from "./miniApp";
import { repositories } from "./repositories";
import { terrorPayService } from "./services/terrorPayService";

function normalizeDepositStatus(status: string): string {
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

function extractBase64Payload(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^data:.+;base64,(.+)$/);
  return match ? match[1] : value;
}

export function createServer() {
  const app = express();
  app.use(express.json());
  registerMiniAppRoutes(app);

  app.get("/health", async (_req, res) => {
    const providerBalance = await terrorPayService.getProviderBalance().catch(() => null);
    res.json({
      ok: true,
      service: "terrorpay",
      providerBalance,
    });
  });

  app.post("/webhooks/misticpay", async (req, res) => {
    const expected = appConfig.MISTICPAY_WEBHOOK_TOKEN ?? "";
    const token = String(req.query.token ?? "");
    if (expected && expected !== token) {
      persistLog(db, "warn", "webhook.auth", "Webhook rejeitado por token invalido", {
        queryToken: token,
      });
      res.status(401).json({ ok: false });
      return;
    }

    console.log(`[webhook] recebido: ${JSON.stringify(req.body)}`);

    const result = terrorPayService.handleWebhook(req.body);

    if (!result.handled) {
      persistLog(db, "warn", "webhook.misticpay", "Webhook nao processado", {
        reason: result.reason,
        body: req.body,
      });
    }

    persistLog(db, "info", "webhook.misticpay", "Webhook processado", {
      result,
      body: req.body,
    });
    res.json({ ok: true, result });
  });

  app.get("/create_payment", async (req, res) => {
    const telegramId = Number(req.query.user_id);
    const amount = Number(req.query.valor);
    const username =
      typeof req.query.username === "string" && req.query.username.trim()
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
      const user = terrorPayService.ensureExternalUser(telegramId, username);
      const deposit = await terrorPayService.createDeposit(user, amount);

      persistLog(db, "info", "api.create_payment", "Pagamento criado por endpoint publico", {
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
    } catch (error) {
      persistLog(db, "error", "api.create_payment", "Falha ao criar pagamento", {
        telegramId,
        error: (error as Error).message,
      });
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  });

  app.get("/verify_payment", async (req, res) => {
    const paymentId = String(req.query.payment_id ?? "").trim();
    if (!paymentId) {
      res.status(400).json({ ok: false, message: "payment_id invalido" });
      return;
    }

    try {
      await terrorPayService.reconcileDepositByExternalId(paymentId);
    } catch (error) {
      persistLog(db, "warn", "api.verify_payment", "Falha ao reconciliar pagamento antes da consulta", {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const payment = repositories.getDepositByExternalId(paymentId);
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

  app.listen(appConfig.PORT, "0.0.0.0", () => {
    persistLog(db, "info", "server.start", "Servidor HTTP iniciado", {
      port: appConfig.PORT,
    });
    console.log(`HTTP online na porta ${appConfig.PORT}`);
  });
}
