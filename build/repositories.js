"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repositories = void 0;
const db_1 = require("./db");
function roundCurrency(value) {
    return Math.round(Number(value) * 100) / 100;
}
function mapUser(row) {
    return {
        id: row.id,
        telegramId: row.telegramId,
        username: row.username,
        fullName: row.fullName,
        document: row.document,
        role: row.role,
        feePercent: row.feePercent,
        isBlocked: Boolean(row.isBlocked),
        balanceBlocked: Boolean(row.balanceBlocked),
        referredByUserId: row.referredByUserId ?? null,
        affiliateBlocked: Boolean(row.affiliateBlocked),
        termsAcceptedAt: row.termsAcceptedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
exports.repositories = {
    upsertUser(telegramId, username, role) {
        const now = new Date().toISOString();
        db_1.db.prepare(`
      INSERT INTO users (telegramId, username, role, createdAt, updatedAt)
      VALUES (@telegramId, @username, @role, @createdAt, @updatedAt)
      ON CONFLICT(telegramId) DO UPDATE SET
        username = excluded.username,
        role = CASE WHEN users.role = 'admin' THEN users.role ELSE excluded.role END,
        updatedAt = excluded.updatedAt
    `).run({
            telegramId,
            username,
            role,
            createdAt: now,
            updatedAt: now,
        });
        return this.getUserByTelegramId(telegramId);
    },
    getUserByTelegramId(telegramId) {
        const row = db_1.db.prepare("SELECT * FROM users WHERE telegramId = ?").get(telegramId);
        return row ? mapUser(row) : null;
    },
    getUserById(userId) {
        const row = db_1.db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
        return row ? mapUser(row) : null;
    },
    getUserByUsername(username) {
        const normalized = username.replace(/^@/, "").trim();
        if (!normalized) {
            return null;
        }
        const row = db_1.db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(normalized);
        return row ? mapUser(row) : null;
    },
    findUserForAdminLookup(raw) {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed);
            return this.getUserByTelegramId(numeric) ?? this.getUserById(numeric);
        }
        return this.getUserByUsername(trimmed);
    },
    updateUserProfile(userId, fullName, document) {
        db_1.db.prepare(`
      UPDATE users
      SET fullName = ?, document = ?, updatedAt = ?
      WHERE id = ?
    `).run(fullName, document, new Date().toISOString(), userId);
    },
    setUserBlocked(userId, isBlocked) {
        db_1.db.prepare(`
      UPDATE users
      SET isBlocked = ?, updatedAt = ?
      WHERE id = ?
    `).run(isBlocked ? 1 : 0, new Date().toISOString(), userId);
    },
    setUserBalanceBlocked(userId, balanceBlocked) {
        db_1.db.prepare(`
      UPDATE users
      SET balanceBlocked = ?, updatedAt = ?
      WHERE id = ?
    `).run(balanceBlocked ? 1 : 0, new Date().toISOString(), userId);
    },
    setUserAffiliateBlocked(userId, affiliateBlocked) {
        db_1.db.prepare(`
      UPDATE users
      SET affiliateBlocked = ?, updatedAt = ?
      WHERE id = ?
    `).run(affiliateBlocked ? 1 : 0, new Date().toISOString(), userId);
    },
    acceptTerms(userId) {
        const now = new Date().toISOString();
        db_1.db.prepare(`
      UPDATE users
      SET termsAcceptedAt = COALESCE(termsAcceptedAt, ?), updatedAt = ?
      WHERE id = ?
    `).run(now, now, userId);
    },
    getGlobalFeePercent() {
        const row = db_1.db.prepare("SELECT value FROM settings WHERE key = 'globalFeePercent'").get();
        const value = row ? Number(row.value) : 3;
        return Number.isFinite(value) ? value : 3;
    },
    getGlobalFeeFixed() {
        const row = db_1.db.prepare("SELECT value FROM settings WHERE key = 'globalFeeFixed'").get();
        return row ? Number(row.value) : 0;
    },
    /** "percent" ou "fixed" */
    getGlobalFeeMode() {
        const row = db_1.db.prepare("SELECT value FROM settings WHERE key = 'globalFeeMode'").get();
        return row?.value === "fixed" ? "fixed" : "percent";
    },
    setGlobalFeeMode(mode) {
        this.setSetting("globalFeeMode", mode);
    },
    setGlobalFeeFixed(value) {
        db_1.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('globalFeeFixed', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(value));
    },
    getManualWithdrawApprovalThreshold() {
        const value = Number(this.getSetting("manualWithdrawApprovalThreshold") ?? 250);
        return Number.isFinite(value) && value >= 0 ? value : 250;
    },
    setManualWithdrawApprovalThreshold(value) {
        this.setSetting("manualWithdrawApprovalThreshold", String(roundCurrency(value)));
    },
    getAffiliateCommissionPercent() {
        const value = Number(this.getSetting("affiliateCommissionPercent") ?? 20);
        return Number.isFinite(value) && value >= 0 ? value : 20;
    },
    setAffiliateCommissionPercent(value) {
        this.setSetting("affiliateCommissionPercent", String(roundCurrency(value)));
    },
    getAffiliatesEnabled() {
        return this.getBooleanSetting("affiliatesEnabled");
    },
    setAffiliatesEnabled(enabled) {
        this.setBooleanSetting("affiliatesEnabled", enabled);
    },
    getSetting(key) {
        const row = db_1.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
        return row?.value ?? null;
    },
    setSetting(key, value) {
        db_1.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
    },
    getMisticPayClientId(defaultValue) {
        const override = this.getSetting("misticPayClientId");
        return override && override.trim() ? override.trim() : defaultValue;
    },
    getMisticPayClientSecret(defaultValue) {
        const override = this.getSetting("misticPayClientSecret");
        return override && override.trim() ? override.trim() : defaultValue;
    },
    getBooleanSetting(key) {
        return this.getSetting(key) === "true";
    },
    setBooleanSetting(key, value) {
        this.setSetting(key, value ? "true" : "false");
    },
    setGlobalFeePercent(value) {
        db_1.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('globalFeePercent', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(value));
    },
    setUserFeePercent(userId, feePercent) {
        db_1.db.prepare(`
      UPDATE users
      SET feePercent = ?, updatedAt = ?
      WHERE id = ?
    `).run(feePercent, new Date().toISOString(), userId);
    },
    getEffectiveFeePercent(userId) {
        const row = db_1.db.prepare("SELECT feePercent FROM users WHERE id = ?").get(userId);
        return row?.feePercent ?? this.getGlobalFeePercent();
    },
    getBalance(userId) {
        const row = db_1.db
            .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE userId = ?")
            .get(userId);
        return roundCurrency(row.balance);
    },
    repairCompletedDepositCredits(userId) {
        const missingCredits = userId === undefined
            ? db_1.db.prepare(`
          SELECT d.id, d.userId, d.netAmount, d.updatedAt, d.createdAt
          FROM deposit_requests d
          LEFT JOIN ledger_entries l
            ON l.referenceType = 'deposit'
           AND l.referenceId = d.id
          WHERE d.status = 'COMPLETO'
            AND l.id IS NULL
          ORDER BY d.id ASC
        `).all()
            : db_1.db.prepare(`
          SELECT d.id, d.userId, d.netAmount, d.updatedAt, d.createdAt
          FROM deposit_requests d
          LEFT JOIN ledger_entries l
            ON l.referenceType = 'deposit'
           AND l.referenceId = d.id
          WHERE d.userId = ?
            AND d.status = 'COMPLETO'
            AND l.id IS NULL
          ORDER BY d.id ASC
        `).all(userId);
        if (missingCredits.length === 0) {
            return 0;
        }
        db_1.db.transaction(() => {
            for (const deposit of missingCredits) {
                db_1.db.prepare(`
          INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
          VALUES (?, 'deposit_credit', ?, 'Credito de PIX recebido', 'deposit', ?, ?)
        `).run(deposit.userId, Number(deposit.netAmount), deposit.id, deposit.updatedAt || deposit.createdAt || new Date().toISOString());
            }
        })();
        return missingCredits.length;
    },
    createManualBalanceAdjustment(userId, amount, adminUserId, reason) {
        const now = new Date().toISOString();
        const normalizedAmount = roundCurrency(amount);
        const trimmedReason = reason?.trim() ?? "";
        const description = trimmedReason
            ? `Ajuste manual de saldo: ${trimmedReason}`
            : "Ajuste manual de saldo pelo admin";
        db_1.db.prepare(`
      INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
      VALUES (?, 'admin_balance_adjustment', ?, ?, 'admin_balance_adjustment', ?, ?)
    `).run(userId, normalizedAmount, description, adminUserId, now);
    },
    setReferrerIfEligible(userId, referrerTelegramId) {
        const user = this.getUserById(userId);
        const referrer = this.getUserByTelegramId(referrerTelegramId);
        if (!user || !referrer || user.id === referrer.id || user.referredByUserId) {
            return false;
        }
        const result = db_1.db.prepare(`
      UPDATE users
      SET referredByUserId = ?, updatedAt = ?
      WHERE id = ? AND referredByUserId IS NULL
    `).run(referrer.id, new Date().toISOString(), user.id);
        return result.changes > 0;
    },
    awardAffiliateCommissionForDeposit(depositId) {
        if (!this.getAffiliatesEnabled()) {
            return 0;
        }
        const deposit = db_1.db.prepare(`
      SELECT d.id, d.userId, d.feeAmount, u.referredByUserId
      FROM deposit_requests d
      INNER JOIN users u ON u.id = d.userId
      WHERE d.id = ? AND d.status = 'COMPLETO'
    `).get(depositId);
        if (!deposit?.referredByUserId || Number(deposit.feeAmount) <= 0) {
            return 0;
        }
        const affiliate = db_1.db.prepare("SELECT id, affiliateBlocked FROM users WHERE id = ?").get(deposit.referredByUserId);
        if (!affiliate || Boolean(affiliate.affiliateBlocked)) {
            return 0;
        }
        const percent = this.getAffiliateCommissionPercent();
        const commissionAmount = roundCurrency((Number(deposit.feeAmount) * percent) / 100);
        if (commissionAmount <= 0) {
            return 0;
        }
        const now = new Date().toISOString();
        const result = db_1.db.prepare(`
      INSERT OR IGNORE INTO affiliate_commissions (
        affiliateUserId, referredUserId, depositId, baseFeeAmount, percent, commissionAmount, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'CREDITADO', ?)
    `).run(affiliate.id, deposit.userId, depositId, roundCurrency(Number(deposit.feeAmount)), percent, commissionAmount, now);
        if (result.changes === 0) {
            return 0;
        }
        db_1.db.prepare(`
      INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
      VALUES (?, 'affiliate_commission', ?, 'Comissao de afiliado por deposito indicado', 'affiliate_commission', ?, ?)
    `).run(affiliate.id, commissionAmount, Number(result.lastInsertRowid), now);
        return commissionAmount;
    },
    listLedger(userId, limit = 10) {
        return db_1.db
            .prepare(`
        SELECT amount, description, kind, createdAt
        FROM ledger_entries
        WHERE userId = ?
        ORDER BY id DESC
        LIMIT ?
      `)
            .all(userId, limit);
    },
    createDepositRequest(input) {
        const now = new Date().toISOString();
        const result = db_1.db.prepare(`
      INSERT INTO deposit_requests (
        userId, externalId, providerTransactionId, amount, feePercent, feeAmount, netAmount,
        payerName, payerDocument, description, status, qrCodeBase64, qrCodeUrl, copyPaste, createdAt, updatedAt
      ) VALUES (
        @userId, @externalId, @providerTransactionId, @amount, @feePercent, @feeAmount, @netAmount,
        @payerName, @payerDocument, @description, @status, @qrCodeBase64, @qrCodeUrl, @copyPaste, @createdAt, @updatedAt
      )
    `).run({
            ...input,
            createdAt: now,
            updatedAt: now,
        });
        return Number(result.lastInsertRowid);
    },
    getDepositByProviderTransactionId(providerTransactionId) {
        return db_1.db
            .prepare("SELECT * FROM deposit_requests WHERE providerTransactionId = ?")
            .get(providerTransactionId);
    },
    getDepositByExternalId(externalId) {
        return db_1.db.prepare("SELECT * FROM deposit_requests WHERE externalId = ?").get(externalId);
    },
    listOpenDepositsByUser(userId, limit = 10) {
        return db_1.db.prepare(`
      SELECT id, userId, externalId, providerTransactionId, netAmount, status, createdAt
      FROM deposit_requests
      WHERE userId = ?
        AND status NOT IN ('COMPLETO', 'FALHA', 'CANCELADO', 'EXPIRADO')
      ORDER BY id DESC
      LIMIT ?
    `).all(userId, limit);
    },
    listOpenDeposits(limit = 100) {
        return db_1.db.prepare(`
      SELECT id, userId, externalId, providerTransactionId, netAmount, status, createdAt
      FROM deposit_requests
      WHERE status NOT IN ('COMPLETO', 'FALHA', 'CANCELADO', 'EXPIRADO')
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    },
    completeDeposit(depositId, userId, netAmount) {
        const now = new Date().toISOString();
        db_1.db.transaction(() => {
            db_1.db.prepare(`
        UPDATE deposit_requests
        SET status = 'COMPLETO', updatedAt = ?
        WHERE id = ? AND status != 'COMPLETO'
      `).run(now, depositId);
            const exists = db_1.db.prepare(`
        SELECT COUNT(1) AS total
        FROM ledger_entries
        WHERE referenceType = 'deposit' AND referenceId = ?
      `).get(depositId);
            if (exists.total === 0) {
                db_1.db.prepare(`
          INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
          VALUES (?, 'deposit_credit', ?, 'Credito de PIX recebido', 'deposit', ?, ?)
        `).run(userId, netAmount, depositId, now);
            }
            this.awardAffiliateCommissionForDeposit(depositId);
        })();
    },
    updateDepositStatus(depositId, status) {
        db_1.db.prepare(`
      UPDATE deposit_requests
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `).run(status, new Date().toISOString(), depositId);
    },
    createWithdrawRequest(input) {
        const now = new Date().toISOString();
        return db_1.db.transaction(() => {
            const result = db_1.db.prepare(`
        INSERT INTO withdraw_requests (
          userId, externalId, providerTransactionId, amount, feePercent, feeAmount, totalDebit,
          pixKey, pixKeyType, description, status, approvedAt, approvedByUserId, rejectedAt, rejectedByUserId,
          createdAt, updatedAt
        ) VALUES (
          @userId, @externalId, @providerTransactionId, @amount, @feePercent, @feeAmount, @totalDebit,
          @pixKey, @pixKeyType, @description, @status, @approvedAt, @approvedByUserId, @rejectedAt, @rejectedByUserId,
          @createdAt, @updatedAt
        )
      `).run({
                ...input,
                approvedAt: null,
                approvedByUserId: null,
                rejectedAt: null,
                rejectedByUserId: null,
                createdAt: now,
                updatedAt: now,
            });
            db_1.db.prepare(`
        INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
        VALUES (?, 'withdraw_debit', ?, ?, 'withdraw', ?, ?)
      `).run(input.userId, -input.totalDebit, input.description, Number(result.lastInsertRowid), now);
            return Number(result.lastInsertRowid);
        })();
    },
    getWithdrawByProviderTransactionId(providerTransactionId) {
        return db_1.db
            .prepare("SELECT * FROM withdraw_requests WHERE providerTransactionId = ?")
            .get(providerTransactionId);
    },
    getWithdrawByExternalId(externalId) {
        return db_1.db.prepare("SELECT * FROM withdraw_requests WHERE externalId = ?").get(externalId);
    },
    listOpenWithdraws(limit = 100) {
        return db_1.db.prepare(`
      SELECT id, userId, externalId, providerTransactionId, amount, pixKey, status
      FROM withdraw_requests
      WHERE status NOT IN ('AGUARDANDO_APROVACAO', 'REJEITADO', 'COMPLETO', 'FALHA', 'CANCELADO', 'FALHA_REEMBOLSADA')
        AND providerTransactionId IS NOT NULL
        AND TRIM(providerTransactionId) != ''
        AND LOWER(TRIM(providerTransactionId)) NOT IN ('undefined', 'null')
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    },
    listPendingWithdrawApprovals(limit = 20) {
        return db_1.db.prepare(`
      SELECT id, userId, amount, feeAmount, totalDebit, pixKey, pixKeyType, createdAt, status
      FROM withdraw_requests
      WHERE status = 'AGUARDANDO_APROVACAO'
      ORDER BY id ASC
      LIMIT ?
    `).all(limit);
    },
    listPendingWithdrawsForAdmin(limit = 20) {
        return db_1.db.prepare(`
      SELECT id, userId, amount, feeAmount, totalDebit, pixKey, pixKeyType, createdAt, status
      FROM withdraw_requests
      WHERE status NOT IN ('REJEITADO', 'COMPLETO', 'FALHA', 'CANCELADO', 'FALHA_REEMBOLSADA')
      ORDER BY
        CASE status
          WHEN 'AGUARDANDO_APROVACAO' THEN 0
          WHEN 'APROVANDO' THEN 1
          ELSE 2
        END,
        id ASC
      LIMIT ?
    `).all(limit);
    },
    updateWithdrawStatus(withdrawId, status) {
        db_1.db.prepare(`
      UPDATE withdraw_requests
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `).run(status, new Date().toISOString(), withdrawId);
    },
    claimWithdrawApproval(withdrawId, approvedByUserId) {
        const now = new Date().toISOString();
        return db_1.db.transaction(() => {
            const withdraw = db_1.db.prepare("SELECT * FROM withdraw_requests WHERE id = ?").get(withdrawId);
            if (!withdraw || withdraw.status !== "AGUARDANDO_APROVACAO") {
                return null;
            }
            const result = db_1.db.prepare(`
        UPDATE withdraw_requests
        SET status = 'APROVANDO', approvedAt = ?, approvedByUserId = ?, updatedAt = ?
        WHERE id = ? AND status = 'AGUARDANDO_APROVACAO'
      `).run(now, approvedByUserId, now, withdrawId);
            if (result.changes === 0) {
                return null;
            }
            return {
                ...withdraw,
                status: "APROVANDO",
                approvedAt: now,
                approvedByUserId,
            };
        })();
    },
    finalizeWithdrawApproval(withdrawId, providerTransactionId, status) {
        const result = db_1.db.prepare(`
      UPDATE withdraw_requests
      SET providerTransactionId = ?, status = ?, updatedAt = ?
      WHERE id = ? AND UPPER(status) IN ('PENDENTE', 'APROVANDO')
    `).run(providerTransactionId, status, new Date().toISOString(), withdrawId);
        return result.changes > 0;
    },
    revertWithdrawApprovalClaim(withdrawId) {
        db_1.db.prepare(`
      UPDATE withdraw_requests
      SET status = 'AGUARDANDO_APROVACAO', approvedAt = NULL, approvedByUserId = NULL, updatedAt = ?
      WHERE id = ? AND status = 'APROVANDO'
    `).run(new Date().toISOString(), withdrawId);
    },
    rejectWithdrawRequest(withdrawId, rejectedByUserId) {
        const withdraw = db_1.db.prepare("SELECT * FROM withdraw_requests WHERE id = ?").get(withdrawId);
        if (!withdraw || withdraw.status !== "AGUARDANDO_APROVACAO") {
            return false;
        }
        const now = new Date().toISOString();
        const alreadyRefunded = db_1.db.prepare(`
      SELECT COUNT(1) AS total
      FROM ledger_entries
      WHERE referenceType = 'withdraw_refund' AND referenceId = ?
    `).get(withdrawId);
        db_1.db.transaction(() => {
            db_1.db.prepare(`
        UPDATE withdraw_requests
        SET status = 'REJEITADO', rejectedAt = ?, rejectedByUserId = ?, updatedAt = ?
        WHERE id = ?
      `).run(now, rejectedByUserId, now, withdrawId);
            if (alreadyRefunded.total === 0) {
                db_1.db.prepare(`
          INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
          VALUES (?, 'withdraw_refund', ?, 'Estorno de saque rejeitado pelo admin', 'withdraw_refund', ?, ?)
        `).run(withdraw.userId, withdraw.totalDebit, withdrawId, now);
            }
        })();
        return true;
    },
    refundWithdrawIfFailed(withdrawId) {
        const withdraw = db_1.db.prepare("SELECT * FROM withdraw_requests WHERE id = ?").get(withdrawId);
        if (!withdraw) {
            return;
        }
        const now = new Date().toISOString();
        const alreadyRefunded = db_1.db.prepare(`
      SELECT COUNT(1) AS total
      FROM ledger_entries
      WHERE referenceType = 'withdraw_refund' AND referenceId = ?
    `).get(withdrawId);
        if (alreadyRefunded.total > 0) {
            return;
        }
        db_1.db.transaction(() => {
            db_1.db.prepare(`
        UPDATE withdraw_requests
        SET status = 'FALHA_REEMBOLSADA', updatedAt = ?
        WHERE id = ?
      `).run(now, withdrawId);
            db_1.db.prepare(`
        INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
        VALUES (?, 'withdraw_refund', ?, 'Estorno de saque com falha', 'withdraw_refund', ?, ?)
      `).run(withdraw.userId, withdraw.totalDebit, withdrawId, now);
        })();
    },
    refundWithdrawsWithInvalidProviderId() {
        const rows = db_1.db.prepare(`
      SELECT *
      FROM withdraw_requests
      WHERE UPPER(status) IN ('PENDENTE', 'PENDING', 'APROVANDO')
        AND (
          providerTransactionId IS NULL
          OR TRIM(providerTransactionId) = ''
          OR LOWER(TRIM(providerTransactionId)) IN ('undefined', 'null')
        )
    `).all();
        let repaired = 0;
        for (const withdraw of rows) {
            const alreadyRefunded = db_1.db.prepare(`
        SELECT COUNT(1) AS total
        FROM ledger_entries
        WHERE referenceType = 'withdraw_refund' AND referenceId = ?
      `).get(withdraw.id);
            if (alreadyRefunded.total > 0) {
                continue;
            }
            const now = new Date().toISOString();
            db_1.db.transaction(() => {
                db_1.db.prepare(`
          UPDATE withdraw_requests
          SET status = 'FALHA_REEMBOLSADA', updatedAt = ?
          WHERE id = ?
        `).run(now, withdraw.id);
                db_1.db.prepare(`
          INSERT INTO ledger_entries (userId, kind, amount, description, referenceType, referenceId, createdAt)
          VALUES (?, 'withdraw_refund', ?, 'Estorno de saque sem identificador da adquirente', 'withdraw_refund', ?, ?)
        `).run(withdraw.userId, withdraw.totalDebit, withdraw.id, now);
            })();
            repaired++;
        }
        return repaired;
    },
    listUsersWithBalance() {
        return db_1.db
            .prepare(`
        SELECT u.*, COALESCE(SUM(l.amount), 0) AS balance
        FROM users u
        LEFT JOIN ledger_entries l ON l.userId = u.id
        GROUP BY u.id
        ORDER BY u.id DESC
      `)
            .all()
            .map((row) => ({
            ...mapUser(row),
            balance: roundCurrency(row.balance),
        }));
    },
    getUserAdminOverview(userId) {
        this.repairCompletedDepositCredits(userId);
        const row = db_1.db.prepare(`
      SELECT
        u.*,
        COALESCE(lb.balance, 0) AS balance,
        COALESCE(dep.totalAmount, 0) AS totalDeposits,
        COALESCE(dep.totalCount, 0) AS depositsCount,
        COALESCE(wd.totalAmount, 0) AS totalWithdraws,
        COALESCE(wd.totalCount, 0) AS withdrawsCount
      FROM users u
      LEFT JOIN (
        SELECT userId, SUM(amount) AS balance
        FROM ledger_entries
        GROUP BY userId
      ) lb ON lb.userId = u.id
      LEFT JOIN (
        SELECT userId, SUM(amount) AS totalAmount, COUNT(*) AS totalCount
        FROM deposit_requests
        GROUP BY userId
      ) dep ON dep.userId = u.id
      LEFT JOIN (
        SELECT userId, SUM(amount) AS totalAmount, COUNT(*) AS totalCount
        FROM withdraw_requests
        GROUP BY userId
      ) wd ON wd.userId = u.id
      WHERE u.id = ?
    `).get(userId);
        if (!row) {
            return null;
        }
        return {
            ...mapUser(row),
            balance: roundCurrency(row.balance),
            totalDeposits: roundCurrency(row.totalDeposits),
            totalWithdraws: roundCurrency(row.totalWithdraws),
            depositsCount: Number(row.depositsCount),
            withdrawsCount: Number(row.withdrawsCount),
        };
    },
    getAffiliateSummary(userId) {
        const referrals = db_1.db.prepare(`
      SELECT COUNT(1) AS total
      FROM users
      WHERE referredByUserId = ?
    `).get(userId);
        const active = db_1.db.prepare(`
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      INNER JOIN deposit_requests d ON d.userId = u.id AND d.status = 'COMPLETO'
      WHERE u.referredByUserId = ?
    `).get(userId);
        const commission = db_1.db.prepare(`
      SELECT COALESCE(SUM(commissionAmount), 0) AS total
      FROM affiliate_commissions
      WHERE affiliateUserId = ?
    `).get(userId);
        const lastCommissions = db_1.db.prepare(`
      SELECT
        c.commissionAmount AS amount,
        c.baseFeeAmount,
        c.percent,
        c.createdAt,
        u.username AS referredUsername,
        u.telegramId AS referredTelegramId
      FROM affiliate_commissions c
      INNER JOIN users u ON u.id = c.referredUserId
      WHERE c.affiliateUserId = ?
      ORDER BY c.id DESC
      LIMIT 5
    `).all(userId);
        return {
            referralsCount: Number(referrals.total),
            activeReferralsCount: Number(active.total),
            totalCommission: roundCurrency(Number(commission.total)),
            lastCommissions: lastCommissions.map((item) => ({
                ...item,
                amount: roundCurrency(Number(item.amount)),
                baseFeeAmount: roundCurrency(Number(item.baseFeeAmount)),
                percent: Number(item.percent),
            })),
        };
    },
    listAffiliateReferrals(userId, limit = 10) {
        return db_1.db.prepare(`
      SELECT
        u.id,
        u.username,
        u.telegramId,
        u.createdAt,
        COALESCE(d.depositsCount, 0) AS depositsCount,
        COALESCE(d.totalDeposits, 0) AS totalDeposits,
        COALESCE(c.totalCommission, 0) AS totalCommission
      FROM users u
      LEFT JOIN (
        SELECT userId, COUNT(1) AS depositsCount, SUM(amount) AS totalDeposits
        FROM deposit_requests
        WHERE status = 'COMPLETO'
        GROUP BY userId
      ) d ON d.userId = u.id
      LEFT JOIN (
        SELECT referredUserId, SUM(commissionAmount) AS totalCommission
        FROM affiliate_commissions
        WHERE affiliateUserId = ?
        GROUP BY referredUserId
      ) c ON c.referredUserId = u.id
      WHERE u.referredByUserId = ?
      ORDER BY u.id DESC
      LIMIT ?
    `).all(userId, userId, limit).map((item) => ({
            ...item,
            depositsCount: Number(item.depositsCount),
            totalDeposits: roundCurrency(Number(item.totalDeposits)),
            totalCommission: roundCurrency(Number(item.totalCommission)),
        }));
    },
    listAffiliateRanking(limit = 10) {
        return db_1.db.prepare(`
      SELECT
        u.id AS userId,
        u.username,
        u.telegramId,
        COUNT(DISTINCT r.id) AS referralsCount,
        COALESCE(SUM(c.commissionAmount), 0) AS totalCommission
      FROM users u
      LEFT JOIN users r ON r.referredByUserId = u.id
      LEFT JOIN affiliate_commissions c ON c.affiliateUserId = u.id
      WHERE u.role != 'admin'
      GROUP BY u.id
      HAVING referralsCount > 0 OR totalCommission > 0
      ORDER BY totalCommission DESC, referralsCount DESC
      LIMIT ?
    `).all(limit).map((item) => ({
            ...item,
            referralsCount: Number(item.referralsCount),
            totalCommission: roundCurrency(Number(item.totalCommission)),
        }));
    },
    /** Maiores saldos (apenas clientes com saldo positivo). Admins não entram no ranking. */
    listClientUsers() {
        return db_1.db
            .prepare(`
        SELECT *
        FROM users
        WHERE role = 'client'
        ORDER BY id DESC
      `)
            .all()
            .map((row) => mapUser(row));
    },
    listAdminUsers() {
        return db_1.db
            .prepare(`
        SELECT *
        FROM users
        WHERE role = 'admin'
        ORDER BY id DESC
      `)
            .all()
            .map((row) => mapUser(row));
    },
    listUsersRankedByBalance(limit = 25) {
        return db_1.db
            .prepare(`
        SELECT u.*, b.balance AS balance
        FROM users u
        INNER JOIN (
          SELECT userId, SUM(amount) AS balance
          FROM ledger_entries
          GROUP BY userId
          HAVING SUM(amount) > 0
        ) b ON b.userId = u.id
        WHERE u.role != 'admin'
        ORDER BY b.balance DESC
        LIMIT ?
      `)
            .all(limit)
            .map((row) => ({
            ...mapUser(row),
            balance: roundCurrency(row.balance),
        }));
    },
    getTotalDepositFeesCompleted() {
        const row = db_1.db
            .prepare(`SELECT COALESCE(SUM(feeAmount), 0) AS total FROM deposit_requests WHERE status = 'COMPLETO'`)
            .get();
        return roundCurrency(row.total);
    },
    /** Taxas de saques concluídos com sucesso na adquirente. */
    getTotalWithdrawFeesCompleted() {
        const row = db_1.db
            .prepare(`SELECT COALESCE(SUM(feeAmount), 0) AS total FROM withdraw_requests WHERE status = 'COMPLETO'`)
            .get();
        return roundCurrency(row.total);
    },
    getTotalProfitWithdrawnCompleted() {
        const row = db_1.db
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM profit_withdraw_requests WHERE status = 'COMPLETO'`)
            .get();
        return roundCurrency(row.total);
    },
    getTotalProfitWithdrawReserved() {
        const row = db_1.db
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS total
         FROM profit_withdraw_requests
         WHERE status NOT IN ('FALHA', 'CANCELADO')`)
            .get();
        return roundCurrency(row.total);
    },
    listDeposits(userId, limit = 10) {
        return db_1.db
            .prepare(`
        SELECT id, externalId, amount, feeAmount, netAmount, status, createdAt
        FROM deposit_requests
        WHERE userId = ?
        ORDER BY id DESC
        LIMIT ?
      `)
            .all(userId, limit);
    },
    listWithdraws(userId, limit = 10) {
        return db_1.db
            .prepare(`
        SELECT id, externalId, amount, feeAmount, totalDebit, pixKey, pixKeyType, status, createdAt
        FROM withdraw_requests
        WHERE userId = ?
        ORDER BY id DESC
        LIMIT ?
      `)
            .all(userId, limit);
    },
    getDepositById(id) {
        return db_1.db.prepare("SELECT * FROM deposit_requests WHERE id = ?").get(id);
    },
    getWithdrawById(id) {
        return db_1.db.prepare("SELECT * FROM withdraw_requests WHERE id = ?").get(id);
    },
    createProfitWithdrawRequest(input) {
        const now = new Date().toISOString();
        const result = db_1.db.prepare(`
      INSERT INTO profit_withdraw_requests (
        externalId, providerTransactionId, amount, pixKey, pixKeyType, description, status, createdAt, updatedAt
      ) VALUES (
        @externalId, @providerTransactionId, @amount, @pixKey, @pixKeyType, @description, @status, @createdAt, @updatedAt
      )
    `).run({
            ...input,
            createdAt: now,
            updatedAt: now,
        });
        return Number(result.lastInsertRowid);
    },
    getProfitWithdrawByProviderTransactionId(providerTransactionId) {
        return db_1.db
            .prepare("SELECT * FROM profit_withdraw_requests WHERE providerTransactionId = ?")
            .get(providerTransactionId);
    },
    getProfitWithdrawByExternalId(externalId) {
        return db_1.db.prepare("SELECT * FROM profit_withdraw_requests WHERE externalId = ?").get(externalId);
    },
    getProfitWithdrawById(id) {
        return db_1.db.prepare("SELECT * FROM profit_withdraw_requests WHERE id = ?").get(id);
    },
    listOpenProfitWithdraws(limit = 100) {
        return db_1.db.prepare(`
      SELECT id, externalId, providerTransactionId, status
      FROM profit_withdraw_requests
      WHERE status NOT IN ('COMPLETO', 'FALHA', 'CANCELADO')
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    },
    updateProfitWithdrawStatus(withdrawId, status) {
        db_1.db.prepare(`
      UPDATE profit_withdraw_requests
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `).run(status, new Date().toISOString(), withdrawId);
    },
    listRecentLogs(limit = 15) {
        return db_1.db
            .prepare(`
        SELECT level, context, message, createdAt
        FROM logs
        ORDER BY id DESC
        LIMIT ?
      `)
            .all(limit);
    },
    savePixKey(userId, pixKey, pixKeyType, alias) {
        db_1.db.prepare(`
      INSERT INTO saved_pix_keys (userId, pixKey, pixKeyType, alias, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pixKey, pixKeyType, alias ?? null, new Date().toISOString());
    },
    listSavedPixKeys(userId) {
        return db_1.db
            .prepare(`
        SELECT id, pixKey, pixKeyType, alias
        FROM saved_pix_keys
        WHERE userId = ?
        ORDER BY id DESC
      `)
            .all(userId);
    },
    getSavedPixKey(keyId) {
        const row = db_1.db.prepare("SELECT pixKey, pixKeyType FROM saved_pix_keys WHERE id = ?").get(keyId);
        return row ?? null;
    },
    getSavedPixKeyForUser(userId, keyId) {
        const row = db_1.db.prepare(`
      SELECT id, pixKey, pixKeyType, alias
      FROM saved_pix_keys
      WHERE id = ? AND userId = ?
    `).get(keyId, userId);
        return row ?? null;
    },
    hasSavedPixKey(userId, pixKey, pixKeyType) {
        const row = db_1.db.prepare(`
      SELECT COUNT(1) AS total
      FROM saved_pix_keys
      WHERE userId = ? AND pixKey = ? AND pixKeyType = ?
    `).get(userId, pixKey, pixKeyType);
        return row.total > 0;
    },
    deleteSavedPixKey(keyId) {
        db_1.db.prepare("DELETE FROM saved_pix_keys WHERE id = ?").run(keyId);
    },
    getFakeAnnouncementsEnabled() {
        return this.getBooleanSetting("fakeAnnouncementsEnabled");
    },
    setFakeAnnouncementsEnabled(enabled) {
        this.setBooleanSetting("fakeAnnouncementsEnabled", enabled);
    },
    getFakeAnnouncementsConfig() {
        return {
            minValue: Number(this.getSetting("fakeAnnouncementsMinValue") ?? 10),
            maxValue: Number(this.getSetting("fakeAnnouncementsMaxValue") ?? 500),
            minInterval: Number(this.getSetting("fakeAnnouncementsMinInterval") ?? 300),
            maxInterval: Number(this.getSetting("fakeAnnouncementsMaxInterval") ?? 1800),
        };
    },
    setFakeAnnouncementsConfig(config) {
        if (config.minValue !== undefined)
            this.setSetting("fakeAnnouncementsMinValue", String(config.minValue));
        if (config.maxValue !== undefined)
            this.setSetting("fakeAnnouncementsMaxValue", String(config.maxValue));
        if (config.minInterval !== undefined)
            this.setSetting("fakeAnnouncementsMinInterval", String(config.minInterval));
        if (config.maxInterval !== undefined)
            this.setSetting("fakeAnnouncementsMaxInterval", String(config.maxInterval));
    },
    getAdminUsername() {
        return this.getSetting("adminUsername");
    },
    setAdminUsername(username) {
        this.setSetting("adminUsername", username);
    },
};
