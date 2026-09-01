"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.terrorPayService = void 0;
const node_crypto_1 = require("node:crypto");
const format_1 = require("../format");
const db_1 = require("../db");
const logger_1 = require("../logger");
const repositories_1 = require("../repositories");
const misticPayClient_1 = require("./misticPayClient");
function round(value) {
    return Math.round(value * 100) / 100;
}
const DEPOSIT_EXPIRATION_MS = 30 * 60 * 1000;
function calcFee(amount) {
    const mode = repositories_1.repositories.getGlobalFeeMode();
    if (mode === "fixed") {
        const feeAmount = round(repositories_1.repositories.getGlobalFeeFixed());
        return { feePercent: 0, feeAmount, mode };
    }
    const feePercent = repositories_1.repositories.getEffectiveFeePercent(0); // global percent
    const feeAmount = round((amount * feePercent) / 100);
    return { feePercent, feeAmount, mode };
}
function calcFeeForUser(userId, amount) {
    const mode = repositories_1.repositories.getGlobalFeeMode();
    if (mode === "fixed") {
        const feeAmount = round(repositories_1.repositories.getGlobalFeeFixed());
        return { feePercent: 0, feeAmount, mode };
    }
    const feePercent = repositories_1.repositories.getEffectiveFeePercent(userId);
    const feeAmount = round((amount * feePercent) / 100);
    return { feePercent, feeAmount, mode };
}
function calcWithdrawPreview(userId, requestedAmount, feeMode) {
    const { feePercent, feeAmount, mode } = calcFeeForUser(userId, requestedAmount);
    if (feeMode === "discount_fee") {
        const recipientAmount = round(requestedAmount - feeAmount);
        return {
            requestedAmount,
            transferAmount: recipientAmount,
            recipientAmount,
            feePercent,
            feeAmount,
            totalDebit: requestedAmount,
            mode,
            feeMode,
        };
    }
    return {
        requestedAmount,
        transferAmount: requestedAmount,
        recipientAmount: requestedAmount,
        feePercent,
        feeAmount,
        totalDebit: round(requestedAmount + feeAmount),
        mode,
        feeMode,
    };
}
function normalizeProviderStatus(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized || null;
}
function extractWebhookStatus(payload) {
    return normalizeProviderStatus(payload?.status)
        ?? normalizeProviderStatus(payload?.transactionState)
        ?? normalizeProviderStatus(payload?.transaction?.status)
        ?? normalizeProviderStatus(payload?.transaction?.transactionState)
        ?? normalizeProviderStatus(payload?.data?.status)
        ?? normalizeProviderStatus(payload?.data?.transactionState);
}
function extractWebhookTransactionType(payload) {
    return normalizeProviderStatus(payload?.transactionType)
        ?? normalizeProviderStatus(payload?.type)
        ?? normalizeProviderStatus(payload?.data?.transactionType)
        ?? normalizeProviderStatus(payload?.data?.type);
}
function extractWebhookCandidateIds(payload) {
    const candidates = [
        payload?.transactionId,
        payload?.externalId,
        payload?.id,
        payload?.txid,
        payload?.paymentId,
        payload?.data?.transactionId,
        payload?.data?.externalId,
        payload?.data?.id,
        payload?.data?.txid,
        payload?.data?.paymentId,
        payload?.transaction?.transactionId,
    ];
    return [...new Set(candidates
            .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
            .filter(Boolean))];
}
function isFinalStatus(status) {
    return status === "COMPLETO"
        || status === "FALHA"
        || status === "CANCELADO"
        || status === "EXPIRADO"
        || status === "FALHA_REEMBOLSADA"
        || status === "REJEITADO";
}
function isDepositExpired(createdAt) {
    if (!createdAt) {
        return false;
    }
    const createdAtMs = new Date(createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) {
        return false;
    }
    return Date.now() - createdAtMs >= DEPOSIT_EXPIRATION_MS;
}
function requiresManualWithdrawApproval(requestedAmount) {
    return requestedAmount > repositories_1.repositories.getManualWithdrawApprovalThreshold();
}
function getWithdrawProviderTransactionId(result, fallbackTransactionId) {
    const data = result.data;
    const candidates = [
        data.transactionId,
        data.id,
        data.transaction?.transactionId,
        data.transaction?.id,
        data.jobId,
        fallbackTransactionId,
    ];
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) {
            continue;
        }
        const normalized = String(candidate).trim();
        if (normalized && normalized !== "undefined" && normalized !== "null") {
            return normalized;
        }
    }
    throw new Error("A MisticPay criou o saque sem retornar um identificador de transação.");
}
function getWithdrawProviderStatus(result) {
    return normalizeProviderStatus(result.data.status)
        ?? normalizeProviderStatus(result.data.transactionState)
        ?? normalizeProviderStatus(result.data.transaction?.status)
        ?? normalizeProviderStatus(result.data.transaction?.transactionState)
        ?? "PENDENTE";
}
function createProviderWithdrawTransactionId(localExternalId) {
    return `${localExternalId}-gate-${Date.now()}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
}
function hasValidProviderTransactionId(value) {
    if (value === null || value === undefined) {
        return false;
    }
    const normalized = String(value).trim().toLowerCase();
    return Boolean(normalized) && normalized !== "undefined" && normalized !== "null";
}
function isPendingWithdrawStatus(status) {
    return ["PENDENTE", "PENDING", "APROVANDO"].includes(String(status ?? "").trim().toUpperCase());
}
function dispatchDepositApprovalNotifications(userId, netAmount) {
    const user = repositories_1.repositories.getUserById(userId);
    if (!user) {
        return;
    }
    import("../bot.js").then(({ notifyDepositCompleted, publishReferenceAnnouncement }) => {
        notifyDepositCompleted(user, netAmount).catch(() => { });
        publishReferenceAnnouncement(user, netAmount).catch(() => { });
    }).catch(() => { });
}
exports.terrorPayService = {
    ensureExternalUser(telegramId, username) {
        return repositories_1.repositories.upsertUser(telegramId, username ?? null, "client");
    },
    getUserBalance(userId) {
        repositories_1.repositories.repairCompletedDepositCredits(userId);
        return repositories_1.repositories.getBalance(userId);
    },
    getUserFeePercent(userId) {
        return repositories_1.repositories.getEffectiveFeePercent(userId);
    },
    getWithdrawPreview(userId, requestedAmount, feeMode) {
        return calcWithdrawPreview(userId, requestedAmount, feeMode);
    },
    getManualWithdrawApprovalThreshold() {
        return repositories_1.repositories.getManualWithdrawApprovalThreshold();
    },
    getSummary(userId) {
        repositories_1.repositories.repairCompletedDepositCredits(userId);
        const mode = repositories_1.repositories.getGlobalFeeMode();
        const feeDisplay = mode === "fixed"
            ? `R$ ${repositories_1.repositories.getGlobalFeeFixed().toFixed(2)} fixo`
            : `${repositories_1.repositories.getEffectiveFeePercent(userId)}%`;
        return {
            user: repositories_1.repositories.getUserById(userId),
            balance: repositories_1.repositories.getBalance(userId),
            feePercent: repositories_1.repositories.getEffectiveFeePercent(userId),
            feeDisplay,
            feeMode: mode,
            ledger: repositories_1.repositories.listLedger(userId, 8),
        };
    },
    getFeeSummary() {
        const depositFees = repositories_1.repositories.getTotalDepositFeesCompleted();
        const withdrawFees = repositories_1.repositories.getTotalWithdrawFeesCompleted();
        const grossFees = round(depositFees + withdrawFees);
        const reservedProfitWithdraws = repositories_1.repositories.getTotalProfitWithdrawReserved();
        const completedProfitWithdraws = repositories_1.repositories.getTotalProfitWithdrawnCompleted();
        return {
            depositFees,
            withdrawFees,
            grossFees,
            reservedProfitWithdraws,
            completedProfitWithdraws,
            processingProfitWithdraws: round(Math.max(reservedProfitWithdraws - completedProfitWithdraws, 0)),
            availableProfitWithdraw: round(Math.max(grossFees - reservedProfitWithdraws, 0)),
        };
    },
    async createDeposit(user, amount) {
        if (user.isBlocked) {
            throw new Error("Sua conta está bloqueada no momento. Fale com o suporte.");
        }
        const { feePercent, feeAmount } = calcFeeForUser(user.id, amount);
        const netAmount = round(amount - feeAmount);
        const externalId = `terrorpay-deposit-${user.id}-${Date.now()}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const description = `Recarga TerrorPay ${externalId}`;
        const payerName = user.username ? `@${user.username}` : `usuario_${user.telegramId}`;
        const payerDocument = (0, format_1.normalizeDocument)("00000000000");
        const result = await misticPayClient_1.misticPayClient.createPixCharge({
            amount,
            payerName,
            payerDocument,
            transactionId: externalId,
            description,
        });
        (0, logger_1.persistLog)(db_1.db, "info", "deposit.create", "Resposta da MisticPay ao criar cobrança", {
            externalId,
            providerTransactionId: result.data.transactionId,
            transactionState: result.data.transactionState,
            rawData: result.data,
        });
        console.log(`[deposit.create] externalId=${externalId} providerTxId=${result.data.transactionId} state=${result.data.transactionState}`);
        repositories_1.repositories.createDepositRequest({
            userId: user.id,
            externalId,
            providerTransactionId: result.data.transactionId,
            amount,
            feePercent,
            feeAmount,
            netAmount,
            payerName,
            payerDocument,
            description,
            status: result.data.transactionState,
            qrCodeBase64: result.data.qrCodeBase64 ?? null,
            qrCodeUrl: result.data.qrcodeUrl ?? null,
            copyPaste: result.data.copyPaste ?? null,
        });
        // inicia polling ativo para confirmar o pagamento independente do webhook
        const savedDeposit = repositories_1.repositories.getDepositByExternalId(externalId);
        if (savedDeposit) {
            this.startDepositPolling(savedDeposit.id, result.data.transactionId, () => { });
        }
        return {
            externalId,
            amount,
            feeAmount,
            netAmount,
            qrCodeBase64: result.data.qrCodeBase64 ?? null,
            qrCodeUrl: result.data.qrcodeUrl ?? null,
            copyPaste: result.data.copyPaste ?? null,
        };
    },
    async requestWithdraw(user, requestedAmount, pixKey, pixKeyType, feeMode) {
        if (user.isBlocked) {
            throw new Error("Sua conta está bloqueada no momento. Fale com o suporte.");
        }
        if (user.balanceBlocked) {
            throw new Error("Seu saldo está bloqueado para saques no momento. Fale com o suporte.");
        }
        const preview = calcWithdrawPreview(user.id, requestedAmount, feeMode);
        const balance = repositories_1.repositories.getBalance(user.id);
        if (preview.recipientAmount <= 0) {
            throw new Error("O valor final a receber ficou zerado ou negativo por causa da taxa. Envie um valor maior.");
        }
        if (balance < preview.totalDebit) {
            throw new Error(`Saldo insuficiente. Voce precisa de R$ ${preview.totalDebit.toFixed(2)} para concluir este saque.`);
        }
        const externalId = `terrorpay-withdraw-${user.id}-${Date.now()}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const description = `Saque TerrorPay ${externalId}`;
        const needsApproval = requiresManualWithdrawApproval(requestedAmount);
        if (needsApproval) {
            const withdrawId = repositories_1.repositories.createWithdrawRequest({
                userId: user.id,
                externalId,
                providerTransactionId: null,
                amount: preview.transferAmount,
                feePercent: preview.feePercent,
                feeAmount: preview.feeAmount,
                totalDebit: preview.totalDebit,
                pixKey,
                pixKeyType,
                description,
                status: "AGUARDANDO_APROVACAO",
            });
            (0, logger_1.persistLog)(db_1.db, "info", "withdraw.manual_approval", "Saque aguardando aprovacao manual", {
                withdrawId,
                userId: user.id,
                requestedAmount,
                transferAmount: preview.transferAmount,
                totalDebit: preview.totalDebit,
            });
            return {
                externalId,
                withdrawId,
                amount: preview.transferAmount,
                requestedAmount: preview.requestedAmount,
                recipientAmount: preview.recipientAmount,
                feeAmount: preview.feeAmount,
                totalDebit: preview.totalDebit,
                feeMode: preview.feeMode,
                status: "AGUARDANDO_APROVACAO",
                requiresApproval: true,
            };
        }
        let result;
        const providerRequestId = createProviderWithdrawTransactionId(externalId);
        try {
            result = await misticPayClient_1.misticPayClient.createPixWithdraw({
                amount: preview.transferAmount,
                pixKey,
                pixKeyType,
                description,
                transactionId: providerRequestId,
            });
        }
        catch (error) {
            (0, logger_1.persistLog)(db_1.db, "error", "withdraw.direct.create", "Gate recusou saque direto", {
                userId: user.id,
                requestedAmount,
                transferAmount: preview.transferAmount,
                totalDebit: preview.totalDebit,
                pixKeyType,
                externalId,
                providerRequestId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        const providerTransactionId = getWithdrawProviderTransactionId(result, providerRequestId);
        const providerStatus = getWithdrawProviderStatus(result);
        const withdrawId = repositories_1.repositories.createWithdrawRequest({
            userId: user.id,
            externalId,
            providerTransactionId,
            amount: preview.transferAmount,
            feePercent: preview.feePercent,
            feeAmount: preview.feeAmount,
            totalDebit: preview.totalDebit,
            pixKey,
            pixKeyType,
            description,
            status: providerStatus,
        });
        this.startWithdrawPolling(withdrawId, providerTransactionId, (finalStatus) => {
            import("../bot.js").then(({ notifyWithdrawCompleted }) => {
                notifyWithdrawCompleted(user, preview.transferAmount, pixKey, finalStatus).catch(() => { });
            });
        });
        return {
            externalId,
            withdrawId,
            amount: preview.transferAmount,
            requestedAmount: preview.requestedAmount,
            recipientAmount: preview.recipientAmount,
            feeAmount: preview.feeAmount,
            totalDebit: preview.totalDebit,
            feeMode: preview.feeMode,
            status: providerStatus,
            requiresApproval: false,
        };
    },
    async approveWithdrawByAdmin(withdrawId, adminUserId) {
        const currentWithdraw = repositories_1.repositories.getWithdrawById(withdrawId);
        if (!currentWithdraw) {
            throw new Error("Saque não encontrado.");
        }
        const currentStatus = String(currentWithdraw.status ?? "").trim().toUpperCase();
        const canRetryDirectWithdraw = isPendingWithdrawStatus(currentWithdraw.status)
            && !hasValidProviderTransactionId(currentWithdraw.providerTransactionId);
        const shouldRevertApprovalClaim = currentStatus === "AGUARDANDO_APROVACAO";
        const claimedWithdraw = shouldRevertApprovalClaim
            ? repositories_1.repositories.claimWithdrawApproval(withdrawId, adminUserId)
            : canRetryDirectWithdraw
                ? currentWithdraw
                : null;
        if (!claimedWithdraw) {
            throw new Error("Esse saque não pode ser aprovado/enviado agora.");
        }
        try {
            const providerRequestId = createProviderWithdrawTransactionId(String(claimedWithdraw.externalId));
            const result = await misticPayClient_1.misticPayClient.createPixWithdraw({
                amount: Number(claimedWithdraw.amount),
                pixKey: String(claimedWithdraw.pixKey),
                pixKeyType: claimedWithdraw.pixKeyType,
                description: String(claimedWithdraw.description),
                transactionId: providerRequestId,
            });
            const providerTransactionId = getWithdrawProviderTransactionId(result, providerRequestId);
            const providerStatus = getWithdrawProviderStatus(result);
            const finalized = repositories_1.repositories.finalizeWithdrawApproval(withdrawId, providerTransactionId, providerStatus);
            if (!finalized) {
                throw new Error("Não foi possível finalizar a aprovação desse saque.");
            }
            const user = repositories_1.repositories.getUserById(claimedWithdraw.userId);
            if (user) {
                this.startWithdrawPolling(withdrawId, providerTransactionId, (finalStatus) => {
                    import("../bot.js").then(({ notifyWithdrawCompleted }) => {
                        notifyWithdrawCompleted(user, Number(claimedWithdraw.amount), String(claimedWithdraw.pixKey), finalStatus)
                            .catch(() => { });
                    });
                });
            }
            (0, logger_1.persistLog)(db_1.db, "info", "withdraw.manual_approval.approved", "Saque enviado pela aprovacao do admin", {
                withdrawId,
                adminUserId,
                providerTransactionId,
                status: providerStatus,
            });
            return {
                user,
                amount: Number(claimedWithdraw.amount),
                feeAmount: Number(claimedWithdraw.feeAmount),
                totalDebit: Number(claimedWithdraw.totalDebit),
                pixKey: String(claimedWithdraw.pixKey),
                status: providerStatus,
            };
        }
        catch (error) {
            if (shouldRevertApprovalClaim) {
                repositories_1.repositories.revertWithdrawApprovalClaim(withdrawId);
            }
            throw error;
        }
    },
    rejectWithdrawByAdmin(withdrawId, adminUserId) {
        const withdraw = repositories_1.repositories.getWithdrawById(withdrawId);
        if (!withdraw) {
            throw new Error("Saque não encontrado.");
        }
        const rejected = repositories_1.repositories.rejectWithdrawRequest(withdrawId, adminUserId);
        if (!rejected) {
            throw new Error("Esse saque não está mais aguardando aprovação.");
        }
        (0, logger_1.persistLog)(db_1.db, "info", "withdraw.manual_approval.rejected", "Saque manual rejeitado", {
            withdrawId,
            adminUserId,
            userId: withdraw.userId,
        });
        return withdraw;
    },
    cancelWithdrawByAdmin(withdrawId, adminUserId) {
        const withdraw = repositories_1.repositories.getWithdrawById(withdrawId);
        if (!withdraw) {
            throw new Error("Saque não encontrado.");
        }
        const canCancel = String(withdraw.status ?? "").trim().toUpperCase() === "AGUARDANDO_APROVACAO"
            || (isPendingWithdrawStatus(withdraw.status) && !hasValidProviderTransactionId(withdraw.providerTransactionId));
        if (!canCancel) {
            throw new Error("Esse saque não pode ser excluído/estornado agora.");
        }
        repositories_1.repositories.refundWithdrawIfFailed(withdrawId);
        (0, logger_1.persistLog)(db_1.db, "info", "withdraw.admin_cancel", "Saque cancelado pelo admin", {
            withdrawId,
            adminUserId,
            userId: withdraw.userId,
            previousStatus: withdraw.status,
            providerTransactionId: withdraw.providerTransactionId,
        });
        return withdraw;
    },
    async getProviderBalance() {
        return misticPayClient_1.misticPayClient.getProviderBalance();
    },
    /** Saque direto do lucro de taxas — sem debitar saldo de nenhum cliente. */
    async requestProfitWithdraw(pixKey, pixKeyType, amount) {
        const summary = this.getFeeSummary();
        const requestedAmount = round(amount);
        if (requestedAmount <= 0) {
            throw new Error("Não há lucro disponível para saque.");
        }
        if (requestedAmount > summary.availableProfitWithdraw) {
            throw new Error(`Lucro disponível insuficiente. Disponível agora: R$ ${summary.availableProfitWithdraw.toFixed(2)}.`);
        }
        const externalId = `terrorpay-profit-${Date.now()}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        const description = `Saque de lucro TerrorPay ${externalId}`;
        const result = await misticPayClient_1.misticPayClient.createPixWithdraw({
            amount: requestedAmount,
            pixKey,
            pixKeyType,
            description,
            transactionId: externalId,
        });
        const providerTransactionId = getWithdrawProviderTransactionId(result, externalId);
        const providerStatus = getWithdrawProviderStatus(result);
        const profitWithdrawId = repositories_1.repositories.createProfitWithdrawRequest({
            externalId,
            providerTransactionId,
            amount: requestedAmount,
            pixKey,
            pixKeyType,
            description,
            status: providerStatus,
        });
        this.startProfitWithdrawPolling(profitWithdrawId, providerTransactionId);
        (0, logger_1.persistLog)(db_1.db, "info", "admin.profit_withdraw", "Saque de lucro solicitado", {
            externalId,
            amount: requestedAmount,
            pixKey,
            pixKeyType,
            status: providerStatus,
        });
        return {
            externalId,
            amount: requestedAmount,
            status: providerStatus,
        };
    },
    async reconcilePendingDeposits(userId) {
        const openDeposits = repositories_1.repositories.listOpenDepositsByUser(userId, 10);
        let recovered = 0;
        for (const deposit of openDeposits) {
            try {
                const result = await this.refreshDepositStatus(deposit);
                if (result.justCompleted) {
                    recovered++;
                }
            }
            catch (error) {
                (0, logger_1.persistLog)(db_1.db, "warn", "deposit.reconcile", "Falha ao reconciliar deposito pendente", {
                    depositId: deposit.id,
                    userId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return recovered;
    },
    async reconcileDepositByExternalId(externalId) {
        const deposit = repositories_1.repositories.getDepositByExternalId(externalId);
        if (!deposit) {
            return false;
        }
        const result = await this.refreshDepositStatus(deposit);
        return result.justCompleted;
    },
    async reconcilePendingTransactions(limit = 100) {
        const openDeposits = repositories_1.repositories.listOpenDeposits(limit);
        for (const deposit of openDeposits) {
            try {
                const result = await this.refreshDepositStatus(deposit);
                if (!isFinalStatus(result.status)) {
                    this.startDepositPolling(deposit.id, deposit.providerTransactionId, () => { });
                }
            }
            catch (error) {
                (0, logger_1.persistLog)(db_1.db, "warn", "deposit.resume", "Falha ao retomar deposito pendente", {
                    depositId: deposit.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        const openWithdraws = repositories_1.repositories.listOpenWithdraws(limit);
        for (const withdraw of openWithdraws) {
            try {
                const result = await this.refreshWithdrawStatus(withdraw);
                if (!isFinalStatus(result.status)) {
                    const user = repositories_1.repositories.getUserById(withdraw.userId);
                    this.startWithdrawPolling(withdraw.id, withdraw.providerTransactionId, (finalStatus) => {
                        if (!user) {
                            return;
                        }
                        import("../bot.js").then(({ notifyWithdrawCompleted }) => {
                            notifyWithdrawCompleted(user, withdraw.amount, withdraw.pixKey, finalStatus).catch(() => { });
                        });
                    });
                }
            }
            catch (error) {
                (0, logger_1.persistLog)(db_1.db, "warn", "withdraw.resume", "Falha ao retomar saque pendente", {
                    withdrawId: withdraw.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        const openProfitWithdraws = repositories_1.repositories.listOpenProfitWithdraws(limit);
        for (const profitWithdraw of openProfitWithdraws) {
            try {
                const result = await this.refreshProfitWithdrawStatus(profitWithdraw);
                if (!isFinalStatus(result.status)) {
                    this.startProfitWithdrawPolling(profitWithdraw.id, profitWithdraw.providerTransactionId);
                }
            }
            catch (error) {
                (0, logger_1.persistLog)(db_1.db, "warn", "profit_withdraw.resume", "Falha ao retomar saque de lucro pendente", {
                    profitWithdrawId: profitWithdraw.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    },
    async refreshDepositStatus(deposit) {
        if (deposit.status !== "EXPIRADO" && isDepositExpired(deposit.createdAt)) {
            repositories_1.repositories.updateDepositStatus(deposit.id, "EXPIRADO");
            (0, logger_1.persistLog)(db_1.db, "info", "deposit.expire", "Deposito pendente marcado como expirado", {
                depositId: deposit.id,
                externalId: deposit.externalId,
                createdAt: deposit.createdAt,
            });
            return { status: "EXPIRADO", justCompleted: false };
        }
        const candidateIds = [...new Set([
                String(deposit.providerTransactionId ?? "").trim(),
                String(deposit.externalId ?? "").trim(),
            ].filter(Boolean))];
        let lastError = null;
        for (const candidateId of candidateIds) {
            try {
                const tx = await misticPayClient_1.misticPayClient.checkTransaction(candidateId);
                const status = normalizeProviderStatus(tx.transactionState);
                if (!status) {
                    continue;
                }
                if (status === "COMPLETO" && deposit.status !== "COMPLETO") {
                    repositories_1.repositories.completeDeposit(deposit.id, deposit.userId, Number(deposit.netAmount));
                    dispatchDepositApprovalNotifications(deposit.userId, Number(deposit.netAmount));
                    return { status, justCompleted: true };
                }
                if (status !== deposit.status) {
                    repositories_1.repositories.updateDepositStatus(deposit.id, status);
                }
                return { status, justCompleted: false };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
        if (lastError) {
            throw lastError;
        }
        return { status: null, justCompleted: false };
    },
    async refreshWithdrawStatus(withdraw) {
        if (!withdraw.providerTransactionId) {
            return { status: withdraw.status };
        }
        const candidateIds = [...new Set([
                String(withdraw.providerTransactionId ?? "").trim(),
                String(withdraw.externalId ?? "").trim(),
            ].filter(Boolean))];
        let lastError = null;
        for (const candidateId of candidateIds) {
            try {
                const tx = await misticPayClient_1.misticPayClient.checkTransaction(candidateId);
                const status = normalizeProviderStatus(tx.transactionState);
                if (!status) {
                    continue;
                }
                if (status !== withdraw.status) {
                    repositories_1.repositories.updateWithdrawStatus(withdraw.id, status);
                }
                if (status === "FALHA" || status === "CANCELADO") {
                    repositories_1.repositories.refundWithdrawIfFailed(withdraw.id);
                }
                return { status };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
        if (lastError) {
            throw lastError;
        }
        return { status: null };
    },
    async refreshProfitWithdrawStatus(withdraw) {
        if (!withdraw.providerTransactionId) {
            return { status: withdraw.status };
        }
        const candidateIds = [...new Set([
                String(withdraw.providerTransactionId ?? "").trim(),
                String(withdraw.externalId ?? "").trim(),
            ].filter(Boolean))];
        let lastError = null;
        for (const candidateId of candidateIds) {
            try {
                const tx = await misticPayClient_1.misticPayClient.checkTransaction(candidateId);
                const status = normalizeProviderStatus(tx.transactionState);
                if (!status) {
                    continue;
                }
                if (status !== withdraw.status) {
                    repositories_1.repositories.updateProfitWithdrawStatus(withdraw.id, status);
                }
                return { status };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
        if (lastError) {
            throw lastError;
        }
        return { status: null };
    },
    /** Polling ativo: consulta o status do depósito a cada 15s por até 10 minutos. */
    startDepositPolling(depositId, providerTransactionId, onCompleted) {
        const INTERVAL_MS = 15_000;
        const MAX_ATTEMPTS = 40; // 40 * 15s = 10 minutos
        let attempts = 0;
        const timer = setInterval(async () => {
            attempts++;
            try {
                console.log(`[poll] depositId=${depositId} attempt=${attempts} querying providerTxId=${providerTransactionId}`);
                const deposit = repositories_1.repositories.getDepositByProviderTransactionId(providerTransactionId)
                    ?? repositories_1.repositories.getDepositByExternalId(providerTransactionId);
                if (!deposit) {
                    clearInterval(timer);
                    (0, logger_1.persistLog)(db_1.db, "warn", "deposit.poll", "Deposito nao encontrado durante polling", {
                        depositId,
                        providerTransactionId,
                    });
                    return;
                }
                const result = await this.refreshDepositStatus(deposit);
                console.log(`[poll] depositId=${depositId} attempt=${attempts} state=${result.status}`);
                (0, logger_1.persistLog)(db_1.db, "info", "deposit.poll", `Poll #${attempts} status=${result.status}`, {
                    depositId,
                    providerTransactionId,
                    state: result.status,
                });
                if (result.justCompleted) {
                    clearInterval(timer);
                    console.log(`[poll] depositId=${depositId} COMPLETO — creditando saldo`);
                    onCompleted(deposit.userId, Number(deposit.netAmount));
                    return;
                }
                if (result.status === "EXPIRADO") {
                    clearInterval(timer);
                    console.log(`[poll] depositId=${depositId} expirado por idade`);
                    return;
                }
                if (result.status === "FALHA" || result.status === "CANCELADO") {
                    clearInterval(timer);
                    console.log(`[poll] depositId=${depositId} estado final=${result.status}`);
                    return;
                }
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[poll] depositId=${depositId} attempt=${attempts} ERRO: ${msg}`);
                (0, logger_1.persistLog)(db_1.db, "warn", "deposit.poll", `Erro no poll #${attempts}`, {
                    depositId,
                    error: msg,
                });
            }
            if (attempts >= MAX_ATTEMPTS) {
                clearInterval(timer);
                console.log(`[poll] depositId=${depositId} expirado após ${MAX_ATTEMPTS} tentativas`);
                repositories_1.repositories.updateDepositStatus(depositId, "EXPIRADO");
                (0, logger_1.persistLog)(db_1.db, "warn", "deposit.poll", "Polling expirado sem confirmacao", { depositId });
            }
        }, INTERVAL_MS);
    },
    /** Polling de saque: consulta status a cada 10s por até 5 minutos */
    startWithdrawPolling(withdrawId, providerTransactionId, onCompleted) {
        const INTERVAL_MS = 10_000;
        const MAX_ATTEMPTS = 30; // 30 * 10s = 5 minutos
        let attempts = 0;
        const timer = setInterval(async () => {
            attempts++;
            try {
                console.log(`[withdraw.poll] withdrawId=${withdrawId} attempt=${attempts} querying txId=${providerTransactionId}`);
                const withdraw = repositories_1.repositories.getWithdrawByProviderTransactionId(providerTransactionId)
                    ?? repositories_1.repositories.getWithdrawByExternalId(providerTransactionId);
                if (!withdraw) {
                    clearInterval(timer);
                    (0, logger_1.persistLog)(db_1.db, "warn", "withdraw.poll", "Saque nao encontrado durante polling", {
                        withdrawId,
                        providerTransactionId,
                    });
                    return;
                }
                const result = await this.refreshWithdrawStatus(withdraw);
                console.log(`[withdraw.poll] withdrawId=${withdrawId} attempt=${attempts} state=${result.status}`);
                (0, logger_1.persistLog)(db_1.db, "info", "withdraw.poll", `Poll #${attempts} status=${result.status}`, {
                    withdrawId,
                    providerTransactionId,
                    state: result.status,
                });
                if (result.status === "COMPLETO") {
                    clearInterval(timer);
                    console.log(`[withdraw.poll] withdrawId=${withdrawId} COMPLETO`);
                    onCompleted("COMPLETO");
                    return;
                }
                if (result.status === "FALHA" || result.status === "CANCELADO") {
                    clearInterval(timer);
                    console.log(`[withdraw.poll] withdrawId=${withdrawId} estado final=${result.status}`);
                    onCompleted(result.status);
                    return;
                }
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[withdraw.poll] withdrawId=${withdrawId} attempt=${attempts} ERRO: ${msg}`);
                (0, logger_1.persistLog)(db_1.db, "warn", "withdraw.poll", `Erro no poll #${attempts}`, {
                    withdrawId,
                    error: msg,
                });
            }
            if (attempts >= MAX_ATTEMPTS) {
                clearInterval(timer);
                console.log(`[withdraw.poll] withdrawId=${withdrawId} expirado após ${MAX_ATTEMPTS} tentativas`);
                (0, logger_1.persistLog)(db_1.db, "warn", "withdraw.poll", "Polling expirado sem confirmacao", { withdrawId });
            }
        }, INTERVAL_MS);
    },
    startProfitWithdrawPolling(withdrawId, providerTransactionId) {
        const INTERVAL_MS = 10_000;
        const MAX_ATTEMPTS = 30;
        let attempts = 0;
        const timer = setInterval(async () => {
            attempts++;
            try {
                const withdraw = repositories_1.repositories.getProfitWithdrawByProviderTransactionId(providerTransactionId)
                    ?? repositories_1.repositories.getProfitWithdrawByExternalId(providerTransactionId);
                if (!withdraw) {
                    clearInterval(timer);
                    (0, logger_1.persistLog)(db_1.db, "warn", "profit_withdraw.poll", "Saque de lucro nao encontrado durante polling", {
                        withdrawId,
                        providerTransactionId,
                    });
                    return;
                }
                const result = await this.refreshProfitWithdrawStatus(withdraw);
                (0, logger_1.persistLog)(db_1.db, "info", "profit_withdraw.poll", `Poll #${attempts} status=${result.status}`, {
                    withdrawId,
                    providerTransactionId,
                    state: result.status,
                });
                if (result.status === "COMPLETO" || result.status === "FALHA" || result.status === "CANCELADO") {
                    clearInterval(timer);
                    return;
                }
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                (0, logger_1.persistLog)(db_1.db, "warn", "profit_withdraw.poll", `Erro no poll #${attempts}`, {
                    withdrawId,
                    error: msg,
                });
            }
            if (attempts >= MAX_ATTEMPTS) {
                clearInterval(timer);
                (0, logger_1.persistLog)(db_1.db, "warn", "profit_withdraw.poll", "Polling expirado sem confirmacao", { withdrawId });
            }
        }, INTERVAL_MS);
    },
    handleWebhook(payload) {
        const transactionType = extractWebhookTransactionType(payload);
        const status = extractWebhookStatus(payload);
        const candidateIds = extractWebhookCandidateIds(payload);
        if (transactionType === "DEPOSITO") {
            let deposit = null;
            for (const candidateId of candidateIds) {
                deposit = repositories_1.repositories.getDepositByProviderTransactionId(candidateId);
                if (deposit) {
                    break;
                }
                deposit = repositories_1.repositories.getDepositByExternalId(candidateId);
                if (deposit) {
                    break;
                }
            }
            if (!deposit) {
                return { handled: false, reason: "deposit_not_found", receivedId: candidateIds[0] ?? null };
            }
            let justCompleted = false;
            if (status === "COMPLETO" && deposit.status !== "COMPLETO") {
                repositories_1.repositories.completeDeposit(deposit.id, deposit.userId, deposit.netAmount);
                dispatchDepositApprovalNotifications(deposit.userId, Number(deposit.netAmount));
                justCompleted = true;
            }
            else if (status) {
                repositories_1.repositories.updateDepositStatus(deposit.id, status);
            }
            return {
                handled: true,
                type: "deposit",
                userId: deposit.userId,
                netAmount: Number(deposit.netAmount),
                justCompleted,
            };
        }
        if (transactionType === "RETIRADA") {
            let withdraw = null;
            for (const candidateId of candidateIds) {
                withdraw = repositories_1.repositories.getWithdrawByProviderTransactionId(candidateId);
                if (withdraw) {
                    break;
                }
            }
            if (withdraw) {
                if (status) {
                    repositories_1.repositories.updateWithdrawStatus(withdraw.id, status);
                }
                if (status === "FALHA" || status === "CANCELADO") {
                    repositories_1.repositories.refundWithdrawIfFailed(withdraw.id);
                }
                return { handled: true, type: "withdraw" };
            }
            let profitWithdraw = null;
            for (const candidateId of candidateIds) {
                profitWithdraw = repositories_1.repositories.getProfitWithdrawByProviderTransactionId(candidateId);
                if (profitWithdraw) {
                    break;
                }
            }
            if (!profitWithdraw) {
                return { handled: false, reason: "withdraw_not_found", receivedId: candidateIds[0] ?? null };
            }
            if (status) {
                repositories_1.repositories.updateProfitWithdrawStatus(profitWithdraw.id, status);
            }
            return { handled: true, type: "profit_withdraw" };
        }
        return { handled: false, reason: "unsupported" };
    },
};
