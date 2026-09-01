import { appConfig } from "../config";
import { repositories } from "../repositories";
import type { PixKeyType } from "../types";

type MisticResponse<T> = {
  message: string;
  data: T;
};

function extractErrorMessageFromBody(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return "Falha ao processar a transacao.";
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: unknown;
      error?: unknown;
      data?: { message?: unknown; error?: unknown };
    };

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
  } catch {
    // corpo nao-json
  }

  return trimmed.replace(/^\{|\}$/g, "").trim() || "Falha ao processar a transacao.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const clientId = repositories.getMisticPayClientId(appConfig.MISTICPAY_CLIENT_ID);
  const clientSecret = repositories.getMisticPayClientSecret(appConfig.MISTICPAY_CLIENT_SECRET);

  const response = await fetch(`${appConfig.MISTICPAY_BASE_URL}${path}`, {
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

  return (await response.json()) as T;
}

export const misticPayClient = {
  async getProviderBalance(): Promise<number> {
    const result = await request<MisticResponse<{ balance: number }>>("/users/balance", {
      method: "GET",
    });
    return Number(result.data.balance ?? 0);
  },

  async createPixCharge(input: {
    amount: number;
    payerName: string;
    payerDocument: string;
    transactionId: string;
    description: string;
  }) {
    const result = await request<
      MisticResponse<{
        transactionId: string;
        transactionFee: number;
        transactionState: string;
        qrCodeBase64?: string;
        qrcodeUrl?: string;
        copyPaste?: string;
        [key: string]: unknown;
      }>
    >("/transactions/create", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        projectWebhook: `${appConfig.WEBHOOK_URL}?token=${appConfig.MISTICPAY_WEBHOOK_TOKEN ?? ""}`,
      }),
    });
    console.log(`[misticpay.create] raw response: ${JSON.stringify(result)}`);
    return result;
  },

  async createPixWithdraw(input: {
    amount: number;
    pixKey: string;
    pixKeyType: PixKeyType;
    description: string;
    transactionId?: string;
  }) {
    const result = await request<
      MisticResponse<{
        jobId?: string;
        transactionId?: string | number;
        id?: string | number;
        status?: string;
        transactionState?: string;
        message?: string;
        transaction?: {
          transactionId?: string | number;
          id?: string | number;
          status?: string;
          transactionState?: string;
        };
        [key: string]: unknown;
      }>
    >("/transactions/withdraw", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        projectWebhook: `${appConfig.WEBHOOK_URL}?token=${appConfig.MISTICPAY_WEBHOOK_TOKEN ?? ""}`,
      }),
    });
    console.log(`[misticpay.withdraw] raw response: ${JSON.stringify(result)}`);
    return result;
  },

  async checkTransaction(transactionId: string): Promise<{
    transactionId: string;
    value: number;
    fee: number;
    transactionState: string;
    transactionType: string;
    transactionMethod?: string;
    createdAt?: string;
    updatedAt?: string;
  }> {
    const result = await request<{
      message: string;
      transaction?: {
        transactionId: string;
        value: number;
        fee: number;
        transactionState: string;
        transactionType: string;
        createdAt: string;
        updatedAt: string;
      };
      data?: {
        transactionId?: string | number;
        value?: number;
        amount?: number;
        fee?: number;
        transactionState?: string;
        status?: string;
        transactionType?: string;
        transactionMethod?: string;
        createdAt?: string;
        updatedAt?: string;
      };
    }>("/transactions/check", {
      method: "POST",
      body: JSON.stringify({ transactionId }),
    });
    const tx = (result.transaction ?? result.data) as {
      transactionId?: string | number;
      value?: number;
      amount?: number;
      fee?: number;
      transactionState?: string;
      status?: string;
      transactionType?: string;
      transactionMethod?: string;
      createdAt?: string;
      updatedAt?: string;
    } | undefined;
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
