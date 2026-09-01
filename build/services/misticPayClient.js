"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.misticPayClient = void 0;
const config_1 = require("../config");
const repositories_1 = require("../repositories");
function extractErrorMessageFromBody(rawBody) {
    const trimmed = rawBody.trim();
    if (!trimmed) {
        return "Falha ao processar a transacao.";
    }
    try {
        const parsed = JSON.parse(trimmed);
        const candidates = [
            parsed.message,
            parsed.error,
            parsed.data?.message,
            parsed.data?.error,
        ];
        for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
                return candidate.trim();
            }
        }
    }
    catch {
        // corpo nao-json
    }
    return trimmed.replace(/^\{|\}$/g, "").trim() || "Falha ao processar a transacao.";
}
async function request(path, init) {
    const clientId = repositories_1.repositories.getMisticPayClientId(config_1.appConfig.MISTICPAY_CLIENT_ID);
    const clientSecret = repositories_1.repositories.getMisticPayClientSecret(config_1.appConfig.MISTICPAY_CLIENT_SECRET);
    const response = await fetch(`${config_1.appConfig.MISTICPAY_BASE_URL}${path}`, {
        ...init,
        headers: {
            ci: clientId,
            cs: clientSecret,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    });
    if (!response.ok) {
        const text = await response.text();
        const message = extractErrorMessageFromBody(text);
        throw new Error(message);
    }
    return (await response.json());
}
exports.misticPayClient = {
    async getProviderBalance() {
        const result = await request("/users/balance", {
            method: "GET",
        });
        return Number(result.data.balance ?? 0);
    },
    async createPixCharge(input) {
        const result = await request("/transactions/create", {
            method: "POST",
            body: JSON.stringify({
                ...input,
                projectWebhook: `${config_1.appConfig.WEBHOOK_URL}?token=${config_1.appConfig.MISTICPAY_WEBHOOK_TOKEN ?? ""}`,
            }),
        });
        console.log(`[misticpay.create] raw response: ${JSON.stringify(result)}`);
        return result;
    },
    async createPixWithdraw(input) {
        const result = await request("/transactions/withdraw", {
            method: "POST",
            body: JSON.stringify({
                ...input,
                projectWebhook: `${config_1.appConfig.WEBHOOK_URL}?token=${config_1.appConfig.MISTICPAY_WEBHOOK_TOKEN ?? ""}`,
            }),
        });
        console.log(`[misticpay.withdraw] raw response: ${JSON.stringify(result)}`);
        return result;
    },
    async checkTransaction(transactionId) {
        const result = await request("/transactions/check", {
            method: "POST",
            body: JSON.stringify({ transactionId }),
        });
        const tx = (result.transaction ?? result.data);
        if (!tx) {
            throw new Error("MisticPay retornou a consulta sem objeto de transacao");
        }
        return {
            transactionId: String(tx.transactionId ?? transactionId),
            value: Number(tx.value ?? tx.amount ?? 0),
            fee: Number(tx.fee ?? 0),
            transactionState: String(tx.transactionState ?? tx.status ?? ""),
            transactionType: String(tx.transactionType ?? ""),
            transactionMethod: tx.transactionMethod,
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
        };
    },
};
