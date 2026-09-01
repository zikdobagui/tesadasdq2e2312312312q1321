"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
exports.notifyWithdrawCompleted = notifyWithdrawCompleted;
exports.notifyDepositCompleted = notifyDepositCompleted;
exports.startFakeAnnouncements = startFakeAnnouncements;
exports.stopFakeAnnouncements = stopFakeAnnouncements;
exports.publishReferenceAnnouncement = publishReferenceAnnouncement;
const grammy_1 = require("grammy");
const config_1 = require("./config");
const db_1 = require("./db");
const format_1 = require("./format");
const logger_1 = require("./logger");
const repositories_1 = require("./repositories");
const terrorPayService_1 = require("./services/terrorPayService");
const mainKeyboard = () => new grammy_1.InlineKeyboard()
    .webApp("💎 Abrir painel web", `${config_1.appConfig.BASE_URL}/app`)
    .primary()
    .row()
    .text("💳 Depositar", "menu:deposit")
    .success()
    .text("💸 Sacar", "menu:withdraw")
    .danger()
    .row()
    .text("📊 Extrato", "menu:balance")
    .text("💹 Taxas", "menu:fees")
    .row()
    .text("🤝 Afiliados", "menu:affiliates")
    .text("🔌 API", "menu:docs")
    .row()
    .text("⌨️ Comandos", "menu:commands")
    .text("🧑‍💻 Suporte", "menu:support");
const adminKeyboard = () => new grammy_1.InlineKeyboard()
    .text("👥 Clientes", "admin:section:users")
    .text("💰 Financeiro", "admin:section:finance")
    .row()
    .text("💹 Taxas", "admin:section:fees")
    .text("🔐 Acesso", "admin:section:access")
    .row()
    .text("🪪 Integrações", "admin:section:integrations")
    .text("🤝 Afiliados", "admin:section:affiliates")
    .row()
    .text("📣 Anúncios", "admin:section:announcements")
    .text("🧾 Sistema", "admin:section:system")
    .row()
    .text("⬅️ Menu do bot", "admin:client_menu");
function adminSectionKeyboard(section) {
    const keyboard = new grammy_1.InlineKeyboard();
    if (section === "users") {
        keyboard
            .text("👥 Listar usuários", "admin:users")
            .text("🔎 Buscar usuário", "admin:user_lookup")
            .row()
            .text("🏆 Ranking saldo", "admin:ranking_balance");
    }
    else if (section === "finance") {
        keyboard
            .text("⏳ Saques pendentes", "admin:withdraw_approvals")
            .row()
            .text("💰 Saldo gate", "admin:gate_stats")
            .text("💸 Sacar lucro", "admin:profit_withdraw");
    }
    else if (section === "fees") {
        keyboard
            .text("💹 Taxa global", "admin:global_fee")
            .text("🎯 Taxa por usuário", "admin:user_fee")
            .row()
            .text("🔢 Modo percentual", "admin:fee_mode_percent")
            .text("💲 Modo fixo", "admin:fee_mode_fixed")
            .row()
            .text("🛡️ Limite aprovação", "admin:withdraw_approval_threshold");
    }
    else if (section === "access") {
        keyboard
            .text("📄 Termos ON/OFF", "admin:toggle_terms")
            .text("📢 Canal ON/OFF", "admin:toggle_required_channel")
            .row()
            .text("🔗 Link do canal", "admin:set_required_channel_url")
            .text("🆔 ID do canal", "admin:set_required_channel_id");
    }
    else if (section === "integrations") {
        keyboard
            .text("🪪 Mistic Client ID", "admin:set_misticpay_client_id")
            .row()
            .text("🔐 Mistic Client Secret", "admin:set_misticpay_client_secret")
            .row()
            .text("👤 Username admin", "admin:set_admin_username");
    }
    else if (section === "affiliates") {
        keyboard
            .text("🤝 Afiliados ON/OFF", "admin:toggle_affiliates")
            .row()
            .text("💼 Comissão afiliado", "admin:affiliate_percent");
    }
    else if (section === "announcements") {
        keyboard
            .text("✨ Ref ON/OFF", "admin:toggle_reference_announcements")
            .row()
            .text("💬 Chat referências", "admin:set_reference_chat_id")
            .text("✍️ Texto CTA", "admin:set_reference_cta")
            .row()
            .text("🎭 Anúncio fake", "admin:fake_announcement")
            .row()
            .text("🤖 Auto fake ON/OFF", "admin:toggle_fake_auto")
            .text("⚙️ Config fake", "admin:config_fake_auto");
    }
    else if (section === "system") {
        keyboard
            .text("📋 Logs", "admin:logs")
            .row()
            .text("📨 Aviso geral", "admin:broadcast");
    }
    return keyboard.row().text("⬅️ Voltar categorias", "admin:main_menu");
}
const docsKeyboard = () => new grammy_1.InlineKeyboard()
    .text("📤 Gerar pagamento", "docs:create_payment")
    .row()
    .text("🔍 Verificar pagamento", "docs:verify_payment")
    .row()
    .text("⬅️ Voltar ao menu", "docs:back");
const depositKeyboard = () => new grammy_1.InlineKeyboard().text("⬅️ Voltar ao menu", "deposit:back");
const withdrawKeyboard = () => new grammy_1.InlineKeyboard().text("⬅️ Voltar ao menu", "withdraw:back");
const termsKeyboard = () => new grammy_1.InlineKeyboard()
    .text("✅ Aceito os termos", "terms:accept")
    .row()
    .text("⬅️ Voltar ao menu", "terms:back");
function maskPixKey(pixKey) {
    const trimmed = pixKey.trim();
    if (trimmed.length <= 8) {
        return trimmed;
    }
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
function withdrawKeyKeyboard(userId) {
    const keyboard = new grammy_1.InlineKeyboard();
    const savedKeys = repositories_1.repositories.listSavedPixKeys(userId).slice(0, 8);
    if (savedKeys.length > 0) {
        for (const item of savedKeys) {
            const label = item.alias?.trim()
                ? `💾 ${item.alias}`
                : `💾 ${item.pixKeyType} ${maskPixKey(item.pixKey)}`;
            keyboard.text(label.slice(0, 63), `withdraw:use_saved:${item.id}`).row();
        }
    }
    return keyboard.text("⬅️ Voltar ao menu", "withdraw:back");
}
function withdrawSaveKeyKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("Pular", "withdraw:save_skip")
        .text("⬅️ Voltar ao menu", "withdraw:back");
}
function withdrawModeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("💸 Valor + taxa", "withdraw:mode:add_fee")
        .row()
        .text("🧮 Descontar taxa do valor", "withdraw:mode:discount_fee")
        .row()
        .text("⬅️ Voltar ao menu", "withdraw:back");
}
const infoKeyboard = () => new grammy_1.InlineKeyboard().text("⬅️ Voltar ao menu", "info:back");
const affiliateKeyboard = () => new grammy_1.InlineKeyboard()
    .text("👥 Meus indicados", "affiliate:referrals")
    .text("🏆 Ranking", "affiliate:ranking")
    .row()
    .text("⬅️ Voltar ao menu", "affiliate:back");
function adminUserLookupKeyboard() {
    return new grammy_1.InlineKeyboard().text("⬅️ Voltar ao admin", "admin:main_menu");
}
function adminUserDetailKeyboard(targetUserId, isBlocked, balanceBlocked) {
    return new grammy_1.InlineKeyboard()
        .text(isBlocked ? "✅ Desbloquear usuário" : "⛔ Bloquear usuário", `admin:user:block:${targetUserId}`)
        .row()
        .text(balanceBlocked ? "💸 Desbloquear saldo" : "🔒 Bloquear saldo", `admin:user:balance:${targetUserId}`)
        .row()
        .text("💰 Ajustar saldo", `admin:user:adjust_balance:${targetUserId}`)
        .row()
        .text("🔄 Atualizar", `admin:user:view:${targetUserId}`)
        .text("⬅️ Voltar ao admin", "admin:main_menu");
}
function hasValidProviderTransactionId(value) {
    if (value === null || value === undefined) {
        return false;
    }
    const normalized = String(value).trim().toLowerCase();
    return Boolean(normalized) && normalized !== "undefined" && normalized !== "null";
}
function canAdminSendOrCancelWithdraw(withdraw) {
    const status = String(withdraw?.status ?? "").trim().toUpperCase();
    return status === "AGUARDANDO_APROVACAO"
        || (["PENDENTE", "PENDING", "APROVANDO"].includes(status)
            && !hasValidProviderTransactionId(withdraw?.providerTransactionId));
}
function adminWithdrawApprovalKeyboard(withdrawId, withdraw) {
    const keyboard = new grammy_1.InlineKeyboard();
    if (withdraw && canAdminSendOrCancelWithdraw(withdraw)) {
        keyboard
            .text("✅ Aprovar/Enviar", `admin:withdraw:approve:${withdrawId}`)
            .text("🗑️ Excluir/Estornar", `admin:withdraw:reject:${withdrawId}`)
            .row();
    }
    return keyboard
        .text("🔄 Atualizar", `admin:withdraw:view:${withdrawId}`)
        .text("⬅️ Voltar ao admin", "admin:withdraw_approvals");
}
function adminPendingWithdrawsKeyboard(items) {
    const keyboard = new grammy_1.InlineKeyboard();
    for (const item of items) {
        const user = repositories_1.repositories.getUserById(item.userId);
        const label = `#${item.id} · ${user?.username ? `@${user.username}` : `ID ${item.userId}`} · ${(0, format_1.formatCurrency)(item.amount)} · ${withdrawStatusLabel(item.status)}`;
        keyboard.text(label.slice(0, 63), `admin:withdraw:view:${item.id}`).row();
    }
    return keyboard.text("⬅️ Voltar ao admin", "admin:main_menu");
}
function normalizeTelegramUsername(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const withoutUrl = trimmed
        .replace(/^https?:\/\/t\.me\//i, "")
        .replace(/^t\.me\//i, "")
        .replace(/^@/, "")
        .replace(/\/+$/, "");
    if (!withoutUrl || withoutUrl.startsWith("+") || withoutUrl.includes("/")) {
        return null;
    }
    return withoutUrl;
}
function normalizeTelegramChatTarget(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (/^-?\d+$/.test(trimmed)) {
        return trimmed;
    }
    const username = normalizeTelegramUsername(trimmed);
    return username ? `@${username}` : null;
}
function getSupportUsername() {
    const value = repositories_1.repositories.getAdminUsername();
    const username = value ? normalizeTelegramUsername(value) : null;
    return username;
}
function supportKeyboard() {
    const keyboard = new grammy_1.InlineKeyboard();
    const supportUsername = getSupportUsername();
    if (supportUsername) {
        keyboard.url("🧑‍💻 Falar no suporte", `https://t.me/${supportUsername}`).row();
    }
    return keyboard.text("⬅️ Voltar ao menu", "info:back");
}
function joinChannelKeyboard(channelUrl) {
    const keyboard = new grammy_1.InlineKeyboard();
    if (channelUrl) {
        keyboard.url("📢 Entrar no canal", channelUrl).row();
    }
    return keyboard.text("✅ Já entrei", "join:check");
}
/** Link manual (settings) ou automático: público → t.me; privado → convite gerado pela API. */
async function resolveMandatoryChannelJoinUrl(ctx) {
    const manual = getRequiredChannelUrl();
    if (manual?.trim()) {
        return manual.trim();
    }
    const channelId = getRequiredChannelId();
    if (!channelId?.trim()) {
        return null;
    }
    const id = channelId.trim();
    try {
        const chat = await ctx.api.getChat(id);
        if ("username" in chat && chat.username) {
            return `https://t.me/${chat.username}`;
        }
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "warn", "bot.channel", "getChat ao resolver link do canal obrigatório", {
            channelId: id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    try {
        return await ctx.api.exportChatInviteLink(id);
    }
    catch {
        // tenta criar link alternativo
    }
    try {
        const created = await ctx.api.createChatInviteLink(id);
        return created.invite_link;
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "bot.channel", "Falha ao gerar link de convite (canal privado)", {
            channelId: id,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
function initialSession() {
    return { flow: { name: "idle" } };
}
exports.bot = new grammy_1.Bot(config_1.appConfig.BOT_TOKEN);
exports.bot.use((0, grammy_1.session)({ initial: initialSession }));
function ensureUser(ctx) {
    const tgUser = ctx.from;
    if (!tgUser) {
        throw new Error("Usuário do Telegram não encontrado.");
    }
    const role = config_1.appConfig.ADMIN_IDS.includes(tgUser.id) ? "admin" : "client";
    return repositories_1.repositories.upsertUser(tgUser.id, tgUser.username ?? null, role);
}
async function enforceUserAvailability(ctx, user) {
    if (user.role === "admin") {
        return true;
    }
    if (!user.isBlocked) {
        return true;
    }
    ctx.session.flow = { name: "idle" };
    ctx.session.pendingWithdraw = undefined;
    await sendManagedReply(ctx, buildBlockedUserMessage(user), {
        parse_mode: "HTML",
        reply_markup: supportKeyboard(),
    });
    return false;
}
async function deleteUserMessage(ctx) {
    try {
        if (ctx.chat?.id && ctx.message?.message_id) {
            await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        }
    }
    catch {
        // Sem permissão para apagar ou mensagem já removida.
    }
}
function isValidCpf(value) {
    const digits = value.replace(/\D/g, "");
    if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) {
        return false;
    }
    let sum = 0;
    for (let index = 0; index < 9; index++) {
        sum += Number(digits[index]) * (10 - index);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10) {
        remainder = 0;
    }
    if (remainder !== Number(digits[9])) {
        return false;
    }
    sum = 0;
    for (let index = 0; index < 10; index++) {
        sum += Number(digits[index]) * (11 - index);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10) {
        remainder = 0;
    }
    return remainder === Number(digits[10]);
}
function detectPixKeyType(pixKeyRaw) {
    const pixKey = pixKeyRaw.trim();
    const digits = pixKey.replace(/\D/g, "");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixKey)) {
        return "EMAIL";
    }
    if (digits.length === 14 && /^\d{14}$/.test(digits)) {
        return "CNPJ";
    }
    if (digits.length >= 10 && digits.length <= 13) {
        if (digits.length === 11 && isValidCpf(digits)) {
            return "CPF";
        }
        return "TELEFONE";
    }
    return "CHAVE_ALEATORIA";
}
function buildAdminContactsText() {
    if (config_1.appConfig.ADMIN_IDS.length === 0) {
        return "Não configurado";
    }
    const contacts = config_1.appConfig.ADMIN_IDS.map((telegramId) => {
        const adminUser = repositories_1.repositories.getUserByTelegramId(telegramId);
        if (adminUser?.username) {
            return `@${adminUser.username}`;
        }
        return `ID ${telegramId}`;
    });
    return contacts.join(", ");
}
function parseReferralTelegramId(text) {
    const payload = String(text ?? "").trim();
    const match = payload.match(/^ref_(\d+)$/i);
    if (!match) {
        return null;
    }
    const telegramId = Number(match[1]);
    return Number.isFinite(telegramId) ? telegramId : null;
}
function buildAffiliateLink(user) {
    const botUsername = getReferenceBotUsername();
    if (!botUsername) {
        return `Use /start ref_${user.telegramId}`;
    }
    return `https://t.me/${botUsername}?start=ref_${user.telegramId}`;
}
function getRequiredChannelEnabled() {
    return repositories_1.repositories.getBooleanSetting("requireChannelJoin");
}
function getTermsRequiredEnabled() {
    const value = repositories_1.repositories.getSetting("requireTermsAcceptance");
    return value === null ? true : value === "true";
}
function getRequiredChannelId() {
    const value = repositories_1.repositories.getSetting("requiredChannelId");
    return value && value.trim() ? value.trim() : null;
}
function getRequiredChannelUrl() {
    const value = repositories_1.repositories.getSetting("requiredChannelUrl");
    return value && value.trim() ? value.trim() : null;
}
function getReferenceAnnouncementsEnabled() {
    return repositories_1.repositories.getBooleanSetting("referenceAnnouncementsEnabled");
}
function getReferenceChatId() {
    const value = repositories_1.repositories.getSetting("referenceChatId");
    return value ? normalizeTelegramChatTarget(value) : null;
}
function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function parseJsonErrorText(raw) {
    try {
        const parsed = JSON.parse(raw);
        const candidates = [parsed.message, parsed.error, parsed.data?.message, parsed.data?.error];
        for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
                return candidate.trim();
            }
        }
    }
    catch {
        // segue
    }
    return null;
}
function formatUserErrorMessage(error) {
    let message = error instanceof Error ? error.message : String(error);
    const jsonMessage = parseJsonErrorText(message);
    if (jsonMessage) {
        message = jsonMessage;
    }
    const prefixed = message.match(/^[^:]+:\s*(.+)$/);
    if (prefixed?.[1]) {
        message = prefixed[1].trim();
    }
    message = message
        .replace(/\bMisticPay\b/gi, "provedor")
        .replace(/\\"/g, "\"")
        .replace(/^"+|"+$/g, "")
        .trim();
    return message || "Ocorreu um erro inesperado. Tente novamente.";
}
function buildErrorMessage(title, error) {
    return [
        `<b>❌ ${escapeHtml(title)}</b>`,
        "",
        escapeHtml(formatUserErrorMessage(error)),
    ].join("\n");
}
function isProviderPendingWithdrawError(error) {
    return formatUserErrorMessage(error).toLowerCase().includes("pedido de saque pendente");
}
function isProviderInsufficientBalanceError(error) {
    const message = formatUserErrorMessage(error).toLowerCase();
    return message.includes("saldo insuficiente") && message.includes("faltam");
}
function buildProviderPendingWithdrawMessage() {
    return [
        "<b>⏳ Saque pendente na gate</b>",
        "",
        "A gate recusou o envio porque já existe um pedido de saque pendente lá.",
        "Nenhum novo saque foi criado no bot e nenhum saldo foi reservado agora.",
        "",
        "Aguarde a gate liberar esse saque pendente e tente novamente.",
    ].join("\n");
}
function buildProviderInsufficientBalanceMessage() {
    return [
        "<b>⚠️ Saque indisponível no momento</b>",
        "",
        "A gate recusou o envio por saldo insuficiente na conta de pagamento.",
        "Seu saldo no bot não foi debitado agora.",
        "",
        "Tente novamente mais tarde ou fale com o suporte.",
    ].join("\n");
}
function buildWithdrawAttemptDebug(userId, amount, feeMode) {
    const preview = terrorPayService_1.terrorPayService.getWithdrawPreview(userId, amount, feeMode);
    return {
        valor_tentado: (0, format_1.formatCurrency)(amount),
        saldo_cliente_atual: (0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(userId)),
        valor_enviado_gate: (0, format_1.formatCurrency)(preview.transferAmount),
        destinatario_recebe: (0, format_1.formatCurrency)(preview.recipientAmount),
        debito_total_cliente: (0, format_1.formatCurrency)(preview.totalDebit),
        modo_taxa: feeMode,
    };
}
function maskSecret(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return "não configurado";
    }
    if (trimmed.length <= 8) {
        return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}
function parseSignedMoneyInput(value) {
    const normalized = value.trim().replace(",", ".");
    if (!normalized || !/^[+-]?\d+(\.\d{1,2})?$/.test(normalized)) {
        return null;
    }
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount === 0) {
        return null;
    }
    return Math.round(amount * 100) / 100;
}
function buildWithdrawFlowIntro(userId) {
    const balance = terrorPayService_1.terrorPayService.getUserBalance(userId);
    const mode = repositories_1.repositories.getGlobalFeeMode();
    const feeText = mode === "fixed"
        ? (0, format_1.formatCurrency)(repositories_1.repositories.getGlobalFeeFixed())
        : `${terrorPayService_1.terrorPayService.getUserFeePercent(userId)}%`;
    return [
        "<b>💸 Saque</b>",
        "",
        `Saldo disponível · ${(0, format_1.formatCurrency)(balance)}`,
        `Taxa aplicada · ${feeText}`,
        "",
        "Digite o valor que deseja sacar.",
    ].join("\n");
}
function buildTermsPrompt() {
    return [
        "<b>📄 Termos de uso</b>",
        "",
        "Para usar a gate, confirme que suas transações são lícitas e autorizadas.",
        "",
        "É proibido usar a plataforma para fraude, golpe, lavagem de dinheiro, spam, malware, transações não autorizadas ou qualquer atividade maliciosa.",
        "",
        "Em caso de indício de uso malicioso ou violação destes termos, a administração poderá bloquear a conta e o saldo. Valores vinculados a esse uso ficarão bloqueados e não serão estornados.",
        "",
        "Toque em Aceito os termos para continuar.",
    ].join("\n");
}
async function startWithdrawFlow(ctx, user) {
    if (user.balanceBlocked) {
        await sendManagedReply(ctx, buildBlockedUserMessage(user), {
            parse_mode: "HTML",
            reply_markup: supportKeyboard(),
        });
        return;
    }
    if (!user.termsAcceptedAt) {
        ctx.session.flow = { name: "idle" };
        ctx.session.pendingWithdraw = undefined;
        await sendManagedReply(ctx, buildTermsPrompt(), {
            parse_mode: "HTML",
            reply_markup: termsKeyboard(),
        });
        return;
    }
    ctx.session.flow = { name: "withdraw_amount" };
    await sendManagedReply(ctx, buildWithdrawFlowIntro(user.id), {
        parse_mode: "HTML",
        reply_markup: withdrawKeyboard(),
    });
}
function buildBlockedUserMessage(user) {
    if (user.isBlocked) {
        return [
            "<b>⛔ Conta bloqueada</b>",
            "",
            "Seu acesso foi bloqueado pela administração.",
            "Fale com o suporte para mais informações.",
        ].join("\n");
    }
    if (user.balanceBlocked) {
        return [
            "<b>🔒 Saldo bloqueado</b>",
            "",
            "Seu saldo está temporariamente bloqueado para saques.",
            "Entradas e consultas continuam disponíveis.",
        ].join("\n");
    }
    return "";
}
function buildAdminUserDetailText(targetUserId) {
    const overview = repositories_1.repositories.getUserAdminOverview(targetUserId);
    if (!overview) {
        return "<b>❌ Usuário não encontrado</b>";
    }
    const ledger = repositories_1.repositories.listLedger(targetUserId, 8);
    const deposits = repositories_1.repositories.listDeposits(targetUserId, 5);
    const withdraws = repositories_1.repositories.listWithdraws(targetUserId, 5);
    const feeMode = repositories_1.repositories.getGlobalFeeMode();
    const feeLabel = feeMode === "fixed"
        ? `${(0, format_1.formatCurrency)(repositories_1.repositories.getGlobalFeeFixed())} fixo`
        : `${repositories_1.repositories.getEffectiveFeePercent(targetUserId)}%`;
    const ledgerLines = ledger.length
        ? ledger.map((item) => `${(0, format_1.formatDate)(item.createdAt)} · ${(0, format_1.formatCurrency)(item.amount)} · ${escapeHtml(item.kind)}`)
        : ["<i>Sem movimentações.</i>"];
    const depositLines = deposits.length
        ? deposits.map((item) => `${(0, format_1.formatDate)(item.createdAt)} · ${(0, format_1.formatCurrency)(item.amount)} · ${escapeHtml(item.status)}`)
        : ["<i>Sem depósitos.</i>"];
    const withdrawLines = withdraws.length
        ? withdraws.map((item) => `${(0, format_1.formatDate)(item.createdAt)} · ${(0, format_1.formatCurrency)(item.amount)} · ${escapeHtml(item.status)}`)
        : ["<i>Sem saques.</i>"];
    return [
        "<b>👤 Perfil do usuário</b>",
        "",
        `ID interno · <code>${overview.id}</code>`,
        `Telegram ID · <code>${overview.telegramId}</code>`,
        `Username · ${overview.username ? `@${escapeHtml(overview.username)}` : "—"}`,
        `Nome · ${overview.fullName ? escapeHtml(overview.fullName) : "—"}`,
        `Documento · ${overview.document ? `<code>${escapeHtml(overview.document)}</code>` : "—"}`,
        `Status da conta · ${overview.isBlocked ? "⛔ Bloqueado" : "✅ Ativo"}`,
        `Status do saldo · ${overview.balanceBlocked ? "🔒 Bloqueado" : "💸 Liberado"}`,
        `Saldo atual · ${(0, format_1.formatCurrency)(overview.balance)}`,
        `Taxa aplicada · ${feeLabel}`,
        "",
        "<b>Resumo</b>",
        `Depósitos · ${overview.depositsCount} | ${(0, format_1.formatCurrency)(overview.totalDeposits)}`,
        `Saques · ${overview.withdrawsCount} | ${(0, format_1.formatCurrency)(overview.totalWithdraws)}`,
        "",
        "<b>Extrato recente</b>",
        ...ledgerLines,
        "",
        "<b>Últimos depósitos</b>",
        ...depositLines,
        "",
        "<b>Últimos saques</b>",
        ...withdrawLines,
    ].join("\n");
}
function buildPendingWithdrawApprovalText(withdrawId) {
    const withdraw = repositories_1.repositories.getWithdrawById(withdrawId);
    if (!withdraw) {
        return "<b>❌ Saque não encontrado</b>";
    }
    const targetUser = repositories_1.repositories.getUserById(Number(withdraw.userId));
    const status = withdrawStatusLabel(String(withdraw.status));
    return [
        "<b>🛡️ Aprovação de saque</b>",
        "",
        `ID · <code>${withdraw.id}</code>`,
        `Cliente · ${targetUser ? buildUserAdminLabel(targetUser) : `<code>${withdraw.userId}</code>`}`,
        `Criado em · ${formatExtractDate(String(withdraw.createdAt))}`,
        `Valor enviado · ${(0, format_1.formatCurrency)(Number(withdraw.amount))}`,
        `Taxa · ${(0, format_1.formatCurrency)(Number(withdraw.feeAmount))}`,
        `Débito total · ${(0, format_1.formatCurrency)(Number(withdraw.totalDebit))}`,
        `Chave PIX · <code>${escapeHtml(String(withdraw.pixKey))}</code>`,
        `Tipo · ${escapeHtml(String(withdraw.pixKeyType))}`,
        `Status · ${status}`,
        "",
        String(withdraw.status).trim().toUpperCase() === "AGUARDANDO_APROVACAO"
            ? `Saques acima de ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getManualWithdrawApprovalThreshold())} ficam reservados até aprovação do admin.`
            : hasValidProviderTransactionId(withdraw.providerTransactionId)
                ? "Esse saque já foi enviado para processamento na adquirente."
                : "Esse saque ainda não tem ID válido na adquirente. Use Aprovar/Enviar para tentar subir na gate ou Excluir/Estornar para devolver o saldo.",
    ].join("\n");
}
function buildWithdrawModePrompt(userId, amount) {
    const addFeePreview = terrorPayService_1.terrorPayService.getWithdrawPreview(userId, amount, "add_fee");
    const discountFeePreview = terrorPayService_1.terrorPayService.getWithdrawPreview(userId, amount, "discount_fee");
    const lines = [
        "<b>💸 Escolha como aplicar a taxa</b>",
        "",
        `Valor informado · ${(0, format_1.formatCurrency)(amount)}`,
        "",
        "<b>1. Enviar valor + taxa</b>",
        `Destinatário recebe · ${(0, format_1.formatCurrency)(addFeePreview.recipientAmount)}`,
        `Seu saldo é debitado em · ${(0, format_1.formatCurrency)(addFeePreview.totalDebit)}`,
        "",
        "<b>2. Descontar taxa do valor</b>",
        `Destinatário recebe · ${(0, format_1.formatCurrency)(discountFeePreview.recipientAmount)}`,
        `Seu saldo é debitado em · ${(0, format_1.formatCurrency)(discountFeePreview.totalDebit)}`,
    ];
    lines.push("", "Escolha uma opção abaixo.");
    return lines.join("\n");
}
function buildWithdrawKeyPrompt(userId, amount, feeMode) {
    const preview = terrorPayService_1.terrorPayService.getWithdrawPreview(userId, amount, feeMode);
    const modeLabel = feeMode === "add_fee"
        ? "Valor enviado com taxa separada"
        : "Taxa descontada do valor informado";
    const savedKeys = repositories_1.repositories.listSavedPixKeys(userId);
    const lines = [
        "<b>🔑 Chave PIX</b>",
        "",
        `Modo escolhido · ${modeLabel}`,
        `Valor enviado · ${(0, format_1.formatCurrency)(preview.transferAmount)}`,
        `Taxa · ${(0, format_1.formatCurrency)(preview.feeAmount)}`,
        `Destinatário recebe · ${(0, format_1.formatCurrency)(preview.recipientAmount)}`,
        `Débito total · ${(0, format_1.formatCurrency)(preview.totalDebit)}`,
    ];
    lines.push("", "Envie e-mail, CPF, telefone ou chave aleatória.");
    if (savedKeys.length > 0) {
        lines.push("Ou escolha uma chave salva nos botões abaixo.");
    }
    return lines.join("\n");
}
function isWithdrawPendingProcessingStatus(status) {
    return ["PENDENTE", "PENDING", "APROVANDO", "QUEUED", "PROCESSING"].includes(String(status ?? "").trim().toUpperCase());
}
function buildWithdrawSubmittedMessage(userId, withdraw, keyLabel, canOfferSave = false) {
    if (withdraw.requiresApproval) {
        return [
            "<b>✅ Saque solicitado</b>",
            "",
            `Valor enviado · ${(0, format_1.formatCurrency)(withdraw.amount)}`,
            `Chave · ${escapeHtml(keyLabel)}`,
            `Taxa · ${(0, format_1.formatCurrency)(withdraw.feeAmount)}`,
            `Destinatário recebe · ${(0, format_1.formatCurrency)(withdraw.recipientAmount)}`,
            `Débito total · ${(0, format_1.formatCurrency)(withdraw.totalDebit)}`,
            `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(userId))}`,
            "Status · em processamento",
            ...(canOfferSave ? ["", "Envie um apelido para salvar essa chave PIX ou toque em Pular."] : []),
        ].join("\n");
    }
    const isPending = isWithdrawPendingProcessingStatus(withdraw.status);
    return [
        isPending ? "<b>⏳ Saque pendente</b>" : "<b>✅ Saque em processamento</b>",
        "",
        `Valor enviado · ${(0, format_1.formatCurrency)(withdraw.amount)}`,
        `Chave · ${escapeHtml(keyLabel)}`,
        `Taxa · ${(0, format_1.formatCurrency)(withdraw.feeAmount)}`,
        `Destinatário recebe · ${(0, format_1.formatCurrency)(withdraw.recipientAmount)}`,
        `Débito total · ${(0, format_1.formatCurrency)(withdraw.totalDebit)}`,
        `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(userId))}`,
        `Status · ${withdrawStatusLabel(withdraw.status)}`,
        ...(isPending
            ? ["", "A gate aceitou o saque e ele está pendente de conclusão. O valor já ficou reservado no seu saldo."]
            : []),
        ...(canOfferSave ? ["", "Envie um apelido para salvar essa chave PIX ou toque em Pular."] : []),
    ].join("\n");
}
function medalForRank(rank) {
    if (rank === 1)
        return "🥇";
    if (rank === 2)
        return "🥈";
    if (rank === 3)
        return "🥉";
    return `${rank}.`;
}
function getReferenceCallToAction() {
    return repositories_1.repositories.getSetting("referenceCallToAction") ??
        "Venha para o nosso time. Receba fácil. Cresça rápido.";
}
function getReferenceBotUsername() {
    const value = repositories_1.repositories.getSetting("botUsername");
    const configured = value ? normalizeTelegramUsername(value) : null;
    if (configured) {
        return configured;
    }
    const runtimeUsername = exports.bot.botInfo?.username;
    return runtimeUsername ? normalizeTelegramUsername(runtimeUsername) : null;
}
function humanizeBotName(value) {
    return value
        .replace(/^@/, "")
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function getReferenceBotLabel() {
    const configured = repositories_1.repositories.getSetting("botDisplayName")?.trim();
    if (configured) {
        return configured;
    }
    const username = getReferenceBotUsername();
    if (username) {
        return humanizeBotName(username);
    }
    return "TerrorPay";
}
function maskTelegramId(telegramId) {
    const value = String(telegramId);
    if (value.length <= 3) {
        return value;
    }
    return `${value.slice(0, 3)}${"*".repeat(Math.max(value.length - 3, 4))}`;
}
function buildAnnouncementTitle(kind) {
    return kind === "withdraw"
        ? "✅ <b>Saque efetuado com sucesso!</b>"
        : "🔔 <b>Nova confirmação de pagamento</b>";
}
function buildReferenceAnnouncementText(maskedId, amount, kind) {
    return [
        buildAnnouncementTitle(kind),
        "",
        `👤 <b>Confidencial</b> | ID: <code>${maskedId}</code>`,
        `💰 <b>R$ ${amount.toFixed(2)}</b>`,
        "",
        `<i>${escapeHtml(getReferenceCallToAction())}</i>`,
    ].join("\n");
}
function buildReferenceAnnouncement(user, amount, kind) {
    return buildReferenceAnnouncementText(maskTelegramId(user.telegramId), amount, kind);
}
function buildFakeReferenceAnnouncement(amount, kind) {
    const fakeId = `${Math.floor(Math.random() * 900) + 100}${"*".repeat(6)}`;
    return buildReferenceAnnouncementText(fakeId, amount, kind);
}
function buildUserAdminLabel(user) {
    if (user.username) {
        return `@${escapeHtml(user.username)} · <code>${user.telegramId}</code>`;
    }
    return `<code>${user.telegramId}</code>`;
}
function getAdminNotificationTargets() {
    const configured = config_1.appConfig.ADMIN_IDS;
    const registered = repositories_1.repositories.listAdminUsers().map((admin) => admin.telegramId);
    return [...new Set([...configured, ...registered])];
}
async function notifyAdmins(message, replyMarkup) {
    const adminTargets = getAdminNotificationTargets();
    if (adminTargets.length === 0) {
        return;
    }
    await Promise.allSettled(adminTargets.map(async (telegramId) => {
        await exports.bot.api.sendMessage(telegramId, message, {
            parse_mode: "HTML",
            reply_markup: replyMarkup,
        });
    }));
}
async function sendAdminUserDetail(ctx, targetUserId) {
    const targetUser = repositories_1.repositories.getUserById(targetUserId);
    if (!targetUser) {
        await sendManagedReply(ctx, "<b>❌ Usuário não encontrado</b>", {
            parse_mode: "HTML",
            reply_markup: adminUserLookupKeyboard(),
        });
        return;
    }
    await sendManagedReply(ctx, buildAdminUserDetailText(targetUserId), {
        parse_mode: "HTML",
        reply_markup: adminUserDetailKeyboard(targetUserId, targetUser.isBlocked, targetUser.balanceBlocked),
    });
}
async function sendAdminPendingWithdrawsList(ctx) {
    const pendingWithdraws = repositories_1.repositories.listPendingWithdrawApprovals(15);
    const lines = pendingWithdraws.length
        ? pendingWithdraws.map((item) => {
            const targetUser = repositories_1.repositories.getUserById(item.userId);
            const label = targetUser?.username ? `@${escapeHtml(targetUser.username)}` : `ID ${item.userId}`;
            return `· #<code>${item.id}</code> · ${label} · ${(0, format_1.formatCurrency)(item.amount)} · ${withdrawStatusLabel(item.status)} · ${(0, format_1.formatDate)(item.createdAt)}`;
        })
        : ["<i>Nenhum saque pendente.</i>"];
    await sendManagedReply(ctx, [
        "<b>⏳ Saques pendentes</b>",
        "",
        ...lines,
    ].join("\n"), {
        parse_mode: "HTML",
        reply_markup: pendingWithdraws.length ? adminPendingWithdrawsKeyboard(pendingWithdraws) : adminKeyboard(),
    });
}
async function notifyAdminsError(context, error, user, extra) {
    const parts = [
        "<b>🚨 Erro no bot</b>",
        "",
        `Contexto · ${escapeHtml(context)}`,
        `Mensagem · ${escapeHtml(formatUserErrorMessage(error))}`,
    ];
    if (user) {
        parts.push(`Cliente · ${buildUserAdminLabel(user)}`);
    }
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            parts.push(`${escapeHtml(key)} · ${escapeHtml(String(value))}`);
        }
    }
    try {
        await notifyAdmins(parts.join("\n"));
    }
    catch (notifyError) {
        (0, logger_1.persistLog)(db_1.db, "error", "admin.error.notify", "Falha ao notificar admin sobre erro", {
            context,
            originalError: formatUserErrorMessage(error),
            notifyError: notifyError instanceof Error ? notifyError.message : String(notifyError),
        });
    }
}
async function notifyAdminsDepositCompleted(user, amount) {
    try {
        await notifyAdmins([
            "<b>💰 Depósito aprovado</b>",
            "",
            `Cliente · ${buildUserAdminLabel(user)}`,
            `Valor creditado · ${(0, format_1.formatCurrency)(amount)}`,
            `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
        ].join("\n"));
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "admin.deposit.notify", "Falha ao notificar admin sobre deposito", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
async function notifyAdminsDepositCreated(user, amount) {
    try {
        await notifyAdmins([
            "<b>📥 Pagamento gerado</b>",
            "",
            `Cliente · ${buildUserAdminLabel(user)}`,
            `Valor · ${(0, format_1.formatCurrency)(amount)}`,
        ].join("\n"));
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "admin.deposit.created.notify", "Falha ao notificar admin sobre criacao de deposito", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
async function notifyAdminsWithdrawCompleted(user, amount, pixKey, status) {
    try {
        await notifyAdmins([
            `<b>💸 Saque ${status === "COMPLETO" ? "concluído" : escapeHtml(status)}</b>`,
            "",
            `Cliente · ${buildUserAdminLabel(user)}`,
            `Valor · ${(0, format_1.formatCurrency)(amount)}`,
            `Chave PIX · ${escapeHtml(pixKey)}`,
            `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
        ].join("\n"));
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "admin.withdraw.notify", "Falha ao notificar admin sobre saque", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
async function notifyAdminsWithdrawRequested(user, withdrawId, amount, recipientAmount, totalDebit, pixKey, feeMode, requiresApproval) {
    try {
        await notifyAdmins([
            `<b>${requiresApproval ? "🛡️ Saque aguardando aprovação" : "📤 Saque solicitado"}</b>`,
            "",
            `ID do saque · <code>${withdrawId}</code>`,
            `Cliente · ${buildUserAdminLabel(user)}`,
            `Valor enviado · ${(0, format_1.formatCurrency)(amount)}`,
            `Destinatário recebe · ${(0, format_1.formatCurrency)(recipientAmount)}`,
            `Débito total · ${(0, format_1.formatCurrency)(totalDebit)}`,
            `Modo · ${feeMode === "add_fee" ? "valor + taxa" : "taxa descontada do valor"}`,
            `Chave PIX · ${escapeHtml(pixKey)}`,
        ].join("\n"), requiresApproval ? adminWithdrawApprovalKeyboard(withdrawId, { status: "AGUARDANDO_APROVACAO" }) : undefined);
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "admin.withdraw.requested.notify", "Falha ao notificar admin sobre solicitacao de saque", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
async function isUserInRequiredChannel(ctx, telegramId) {
    const channelId = getRequiredChannelId();
    if (!getRequiredChannelEnabled() || !channelId) {
        return true;
    }
    try {
        const member = await ctx.api.getChatMember(channelId, telegramId);
        return !["left", "kicked"].includes(member.status);
    }
    catch {
        return false;
    }
}
async function enforceRequiredChannel(ctx, user) {
    const ok = await isUserInRequiredChannel(ctx, user.telegramId);
    if (ok) {
        return true;
    }
    const joinUrl = await resolveMandatoryChannelJoinUrl(ctx);
    const lines = [
        "<b>Canal obrigatório</b>",
        "",
        "Toque em <b>Entrar no canal</b> abaixo e depois em <b>Já entrei</b>.",
    ];
    if (!joinUrl) {
        lines.push("", "<i>Não foi possível obter o link automaticamente. O admin deve promover o bot a administrador no canal (com permissão de convites) ou configurar o link em /admin → Link do canal.</i>");
    }
    await sendManagedReply(ctx, lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: joinChannelKeyboard(joinUrl),
    });
    return false;
}
async function enforceTermsAccepted(ctx, user) {
    if (!getTermsRequiredEnabled()) {
        return true;
    }
    if (user.termsAcceptedAt) {
        return true;
    }
    ctx.session.flow = { name: "idle" };
    ctx.session.pendingWithdraw = undefined;
    await sendManagedReply(ctx, buildTermsPrompt(), {
        parse_mode: "HTML",
        reply_markup: termsKeyboard(),
    });
    return false;
}
async function enforceClientAccess(ctx, user) {
    if (user.role === "admin") {
        return enforceUserAvailability(ctx, user);
    }
    if (!(await enforceTermsAccepted(ctx, user))) {
        return false;
    }
    if (!(await enforceUserAvailability(ctx, user))) {
        return false;
    }
    return enforceRequiredChannel(ctx, user);
}
async function sendManagedReply(ctx, text, options) {
    if (ctx.session.lastBotMessageId) {
        try {
            await ctx.api.deleteMessage(ctx.chat.id, ctx.session.lastBotMessageId);
        }
        catch {
            // Se a mensagem anterior já não existir, seguimos normalmente.
        }
    }
    const message = await ctx.reply(text, options);
    ctx.session.lastBotMessageId = message.message_id;
}
async function sendManagedPhoto(ctx, photo, options) {
    if (ctx.session.lastBotMessageId) {
        try {
            await ctx.api.deleteMessage(ctx.chat.id, ctx.session.lastBotMessageId);
        }
        catch {
            // Se a mensagem anterior já não existir, seguimos normalmente.
        }
    }
    const message = await ctx.replyWithPhoto(photo, options);
    ctx.session.lastBotMessageId = message.message_id;
}
function buildDepositCaption(deposit) {
    const now = new Date();
    const two = (value) => String(value).padStart(2, "0");
    const createdAt = `${two(now.getDate())}-${two(now.getMonth() + 1)}-${now.getFullYear()} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
    return [
        `<b>💳 PIX gerado</b> <i>(${createdAt})</i>`,
        "",
        "<b>Código copia e cola</b>",
        `<code>${deposit.copyPaste ?? "Não informado pela integração."}</code>`,
        "",
        `💵 Valor · ${(0, format_1.formatCurrency)(deposit.amount)}`,
    ].join("\n");
}
function getDepositPhotoInput(deposit) {
    if (deposit.qrCodeUrl) {
        return deposit.qrCodeUrl;
    }
    if (!deposit.qrCodeBase64) {
        return null;
    }
    const matches = deposit.qrCodeBase64.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
        return null;
    }
    const mimeType = matches[1];
    const base64 = matches[2];
    const extension = mimeType.includes("png") ? "png" : "jpg";
    return new grammy_1.InputFile(Buffer.from(base64, "base64"), `qrcode.${extension}`);
}
async function sendMainMenu(ctx, user) {
    await terrorPayService_1.terrorPayService.reconcilePendingDeposits(user.id);
    const summary = terrorPayService_1.terrorPayService.getSummary(user.id);
    const lines = [
        "<b>💎 TerrorPay</b>",
        "<i>Painel PIX rápido, compacto e seguro.</i>",
        "",
        `🆔 ID · <code>${user.telegramId}</code>`,
        `💰 Saldo · <b>${(0, format_1.formatCurrency)(summary.balance)}</b>`,
        `💹 Taxa · <b>${summary.feeDisplay}</b>`,
        "",
        "Abra o painel web para ver tudo em uma tela ou use os atalhos abaixo.",
    ];
    await sendManagedReply(ctx, lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: mainKeyboard(),
    });
}
async function sendAdminPanel(ctx) {
    await sendManagedReply(ctx, [
        "<b>⚙️ Painel administrativo</b>",
        "",
        `Termos · <b>${getTermsRequiredEnabled() ? "ON" : "OFF"}</b>`,
        `Canal obrigatório · <b>${getRequiredChannelEnabled() ? "ON" : "OFF"}</b>`,
        `Afiliados · <b>${repositories_1.repositories.getAffiliatesEnabled() ? "ON" : "OFF"}</b>`,
        "",
        "Escolha uma categoria para abrir os controles.",
    ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
}
async function sendAdminSection(ctx, section) {
    const titles = {
        users: "👥 Clientes",
        finance: "💰 Financeiro",
        fees: "💹 Taxas",
        access: "🔐 Acesso",
        integrations: "🪪 Integrações",
        affiliates: "🤝 Afiliados",
        announcements: "📣 Anúncios",
        system: "🧾 Sistema",
    };
    const descriptions = {
        users: "Listagem, busca, bloqueios, saldo e ranking de clientes.",
        finance: "Saques pendentes, saldo da gate e retirada de lucro.",
        fees: "Taxa global, taxa por usuário, modo fixo/percentual e aprovação manual.",
        access: "Aceite de termos e entrada obrigatória em canal.",
        integrations: "Credenciais MisticPay e contato administrativo.",
        affiliates: "Ativar afiliados e definir comissão.",
        announcements: "Referências, anúncios automáticos e anúncios manuais.",
        system: "Logs e aviso geral para clientes.",
    };
    await sendManagedReply(ctx, [
        `<b>${titles[section] ?? "⚙️ Categoria"}</b>`,
        "",
        descriptions[section] ?? "Escolha uma opção abaixo.",
    ].join("\n"), { parse_mode: "HTML", reply_markup: adminSectionKeyboard(section) });
}
function depositStatusLabel(status) {
    const map = {
        COMPLETO: "✅ Aprovado",
        PENDENTE: "⏳ Pendente",
        QUEUED: "⏳ Processando",
        EXPIRADO: "⌛ Expirado",
        CANCELADO: "❌ Cancelado",
        FALHA: "❌ Falhou",
    };
    return map[status] ?? status;
}
function withdrawStatusLabel(status) {
    const map = {
        COMPLETO: "✅ Aprovado",
        AGUARDANDO_APROVACAO: "🛡️ Em análise",
        APROVANDO: "⏳ Enviando",
        PENDENTE: "⏳ Pendente",
        PENDING: "⏳ Pendente",
        QUEUED: "⏳ Processando",
        CANCELADO: "❌ Cancelado",
        FALHA: "❌ Falhou",
        FALHA_REEMBOLSADA: "↩️ Estornado",
        REJEITADO: "❌ Rejeitado",
    };
    const normalized = String(status ?? "").trim().toUpperCase();
    return map[normalized] ?? status;
}
function formatExtractDate(value) {
    const date = new Date(value);
    const two = (input) => String(input).padStart(2, "0");
    return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}
const PAGE_SIZE = 5;
function normalizeExtractState(ctx, section) {
    if (section) {
        ctx.session.extractSection = section;
    }
    if (!ctx.session.extractSection) {
        ctx.session.extractSection = "deposits";
    }
    if (!ctx.session.extractStatus) {
        ctx.session.extractStatus = "ALL";
    }
    if (ctx.session.extractPeriodDays === undefined) {
        ctx.session.extractPeriodDays = 0;
    }
    if (ctx.session.extractPage === undefined) {
        ctx.session.extractPage = 0;
    }
}
function clearExtractSearch(ctx) {
    ctx.session.extractSearchId = undefined;
}
function shortPaymentId(value) {
    return value.length > 14 ? `${value.slice(0, 12)}...` : value;
}
function extractStatusEmoji(status) {
    if (status === "COMPLETO")
        return "✅";
    if (status === "PENDENTE" || status === "QUEUED")
        return "⏳";
    if (status === "AGUARDANDO_APROVACAO" || status === "APROVANDO")
        return "🛡️";
    if (status === "EXPIRADO")
        return "⌛";
    if (status === "FALHA" || status === "CANCELADO")
        return "❌";
    if (status === "FALHA_REEMBOLSADA")
        return "↩️";
    if (status === "REJEITADO")
        return "❌";
    return "•";
}
function extractStatusFilterLabel(status) {
    const labels = {
        ALL: "Todos",
        COMPLETO: "Aprovados",
        PENDENTE: "Pendentes",
        QUEUED: "Fila",
        FALHA: "Falhos",
        CANCELADO: "Cancelados",
    };
    return labels[status];
}
function extractPeriodFilterLabel(period) {
    const labels = {
        1: "Hoje",
        7: "7 dias",
        30: "30 dias",
        0: "Todos",
    };
    return labels[period];
}
function isWithinPeriod(createdAt, periodDays) {
    if (periodDays === 0) {
        return true;
    }
    const created = new Date(createdAt);
    const now = new Date();
    if (periodDays === 1) {
        return created.toDateString() === now.toDateString();
    }
    const threshold = new Date(now);
    threshold.setDate(now.getDate() - periodDays);
    return created >= threshold;
}
function applyExtractFilters(items, status, periodDays, searchId) {
    const search = searchId?.trim().toLowerCase();
    return items.filter((item) => {
        if (status !== "ALL" && item.status !== status) {
            return false;
        }
        if (!isWithinPeriod(item.createdAt, periodDays)) {
            return false;
        }
        if (search && !item.externalId.toLowerCase().includes(search)) {
            return false;
        }
        return true;
    });
}
function extractHomeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("📥 Depósitos", "extract:deposits:0")
        .text("📤 Saques", "extract:withdraws:0")
        .row()
        .text("⬅️ Voltar ao menu", "extract:back");
}
function extractListKeyboard(section, page, total) {
    const kb = new grammy_1.InlineKeyboard();
    const hasPrev = page > 0;
    const hasNext = (page + 1) * PAGE_SIZE < total;
    if (hasPrev || hasNext) {
        if (hasPrev)
            kb.text("◀️ Anterior", `extract:${section}:${page - 1}`);
        if (hasNext)
            kb.text("Próximo ▶️", `extract:${section}:${page + 1}`);
        kb.row();
    }
    kb.text("🔎 Buscar por ID", "extract:search").text("🧹 Limpar busca", "extract:clearsearch").row();
    kb.text("✅ Aprovados", "extract:status:COMPLETO")
        .text("⏳ Pendentes", "extract:status:PENDENTE")
        .row()
        .text("❌ Falhos", "extract:status:FALHA")
        .text("📋 Todos", "extract:status:ALL")
        .row()
        .text("Hoje", "extract:period:1")
        .text("7 dias", "extract:period:7")
        .text("30 dias", "extract:period:30")
        .text("Todos", "extract:period:0")
        .row()
        .text("📥 Depósitos", "extract:deposits:0")
        .text("📤 Saques", "extract:withdraws:0")
        .row()
        .text("⬅️ Voltar ao menu", "extract:back");
    return kb;
}
function buildExtractHome(userId) {
    const balance = terrorPayService_1.terrorPayService.getUserBalance(userId);
    const summary = terrorPayService_1.terrorPayService.getSummary(userId);
    return [
        "<b>💰 Extrato</b>",
        "",
        `Saldo · <b>${(0, format_1.formatCurrency)(balance)}</b>`,
        `Taxa · ${summary.feeDisplay}`,
        "",
        "Escolha uma seção abaixo.",
    ].join("\n");
}
function buildDepositsPage(userId, page, status, periodDays, searchId) {
    const filtered = applyExtractFilters(repositories_1.repositories.listDeposits(userId, 200), status, periodDays, searchId);
    const total = filtered.length;
    const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const balance = terrorPayService_1.terrorPayService.getUserBalance(userId);
    const summary = terrorPayService_1.terrorPayService.getSummary(userId);
    const lines = [
        "<b>📥 Depósitos</b>",
        `Saldo · <b>${(0, format_1.formatCurrency)(balance)}</b>  |  Taxa · ${summary.feeDisplay}`,
        `Página ${page + 1} de ${Math.max(1, Math.ceil(total / PAGE_SIZE))}`,
        `Filtros · ${extractStatusFilterLabel(status)} · ${extractPeriodFilterLabel(periodDays)}`,
        searchId ? `Busca · <code>${escapeHtml(searchId)}</code>` : "Busca · <i>nenhuma</i>",
        "",
        "Selecione um pagamento abaixo:",
        "",
    ];
    if (slice.length === 0) {
        lines.push("<i>Nenhum depósito ainda.</i>");
    }
    return {
        text: lines.join("\n"),
        total,
        items: slice.map((item) => ({
            id: item.id,
            externalId: item.externalId,
            amount: item.amount,
            status: item.status,
            createdAt: item.createdAt,
        })),
    };
}
function buildWithdrawsPage(userId, page, status, periodDays, searchId) {
    const filtered = applyExtractFilters(repositories_1.repositories.listWithdraws(userId, 200), status, periodDays, searchId);
    const total = filtered.length;
    const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const balance = terrorPayService_1.terrorPayService.getUserBalance(userId);
    const lines = [
        "<b>📤 Saques</b>",
        `Saldo · <b>${(0, format_1.formatCurrency)(balance)}</b>`,
        `Página ${page + 1} de ${Math.max(1, Math.ceil(total / PAGE_SIZE))}`,
        `Filtros · ${extractStatusFilterLabel(status)} · ${extractPeriodFilterLabel(periodDays)}`,
        searchId ? `Busca · <code>${escapeHtml(searchId)}</code>` : "Busca · <i>nenhuma</i>",
        "",
        "Selecione um saque abaixo:",
        "",
    ];
    if (slice.length === 0) {
        lines.push("<i>Nenhum saque ainda.</i>");
    }
    return {
        text: lines.join("\n"),
        total,
        items: slice.map((item) => ({
            id: item.id,
            externalId: item.externalId,
            amount: item.amount,
            status: item.status,
            createdAt: item.createdAt,
        })),
    };
}
function buildExtractItemsKeyboard(section, items, page, total) {
    const kb = new grammy_1.InlineKeyboard();
    for (const item of items) {
        const prefix = section === "deposits" ? "d" : "w";
        const label = `${extractStatusEmoji(item.status)} ${shortPaymentId(item.externalId)} · ${(0, format_1.formatCurrency)(item.amount)}`;
        kb.text(label, `extract:item:${prefix}:${item.id}`).row();
    }
    const hasPrev = page > 0;
    const hasNext = (page + 1) * PAGE_SIZE < total;
    if (hasPrev || hasNext) {
        if (hasPrev)
            kb.text("◀️ Anterior", `extract:${section}:${page - 1}`);
        if (hasNext)
            kb.text("Próximo ▶️", `extract:${section}:${page + 1}`);
        kb.row();
    }
    kb.text("🔎 Buscar por ID", "extract:search").text("🧹 Limpar busca", "extract:clearsearch").row();
    kb.text("✅ Aprovados", "extract:status:COMPLETO")
        .text("⏳ Pendentes", "extract:status:PENDENTE")
        .row()
        .text("❌ Falhos", "extract:status:FALHA")
        .text("📋 Todos", "extract:status:ALL")
        .row()
        .text("Hoje", "extract:period:1")
        .text("7 dias", "extract:period:7")
        .row()
        .text("30 dias", "extract:period:30")
        .text("Todos", "extract:period:0")
        .row()
        .text("📥 Depósitos", "extract:deposits:0")
        .text("📤 Saques", "extract:withdraws:0")
        .row()
        .text("⬅️ Voltar ao menu", "extract:back");
    return kb;
}
function buildDepositDetailText(item) {
    return [
        "<b>📥 Detalhe do depósito</b>",
        "",
        `ID · <code>${escapeHtml(item.externalId)}</code>`,
        `Criado em · ${formatExtractDate(item.createdAt)}`,
        `Valor · ${(0, format_1.formatCurrency)(Number(item.amount))}`,
        `Taxa · ${(0, format_1.formatCurrency)(Number(item.feeAmount))}`,
        `Líquido · ${(0, format_1.formatCurrency)(Number(item.netAmount))}`,
        `Status · ${depositStatusLabel(String(item.status))}`,
        item.copyPaste ? `PIX copia e cola · <code>${escapeHtml(String(item.copyPaste))}</code>` : "PIX copia e cola · <i>não disponível</i>",
    ].join("\n");
}
function buildWithdrawDetailText(item) {
    return [
        "<b>📤 Detalhe do saque</b>",
        "",
        `ID · <code>${escapeHtml(item.externalId)}</code>`,
        `Criado em · ${formatExtractDate(item.createdAt)}`,
        `Valor · ${(0, format_1.formatCurrency)(Number(item.amount))}`,
        `Taxa · ${(0, format_1.formatCurrency)(Number(item.feeAmount))}`,
        `Débito total · ${(0, format_1.formatCurrency)(Number(item.totalDebit))}`,
        `Chave PIX · <code>${escapeHtml(String(item.pixKey))}</code>`,
        `Tipo · ${escapeHtml(String(item.pixKeyType))}`,
        `Status · ${withdrawStatusLabel(String(item.status))}`,
    ].join("\n");
}
function extractDetailKeyboard() {
    return new grammy_1.InlineKeyboard().text("⬅️ Voltar à lista", "extract:return");
}
function buildApiDocsHome() {
    return [
        "<b>📚 API REST</b>",
        "",
        "Integre o TerrorPay no seu sistema ou em outro bot.",
        "Escolha o endpoint abaixo para ver parâmetros e exemplos.",
    ].join("\n");
}
function buildAffiliateHome(user) {
    const summary = repositories_1.repositories.getAffiliateSummary(user.id);
    const percent = repositories_1.repositories.getAffiliateCommissionPercent();
    const enabled = repositories_1.repositories.getAffiliatesEnabled() && !user.affiliateBlocked;
    const link = buildAffiliateLink(user);
    const recent = summary.lastCommissions.length
        ? summary.lastCommissions.map((item) => {
            const referred = item.referredUsername
                ? `@${escapeHtml(item.referredUsername)}`
                : `<code>${item.referredTelegramId}</code>`;
            return `· ${(0, format_1.formatDate)(item.createdAt)} · ${referred} · ${(0, format_1.formatCurrency)(item.amount)}`;
        })
        : ["<i>Nenhuma comissão ainda.</i>"];
    return [
        "<b>🤝 Afiliados</b>",
        "",
        `Status · ${enabled ? "✅ Ativo" : "⏸️ Indisponível"}`,
        `Comissão · ${percent}% das taxas dos indicados`,
        "",
        "<b>Seu link</b>",
        `<code>${escapeHtml(link)}</code>`,
        "",
        `Indicados · ${summary.referralsCount}`,
        `Indicados ativos · ${summary.activeReferralsCount}`,
        `Comissão total creditada · ${(0, format_1.formatCurrency)(summary.totalCommission)}`,
        `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
        "",
        "<b>Últimas comissões</b>",
        ...recent,
    ].join("\n");
}
function buildAffiliateReferralsText(userId) {
    const referrals = repositories_1.repositories.listAffiliateReferrals(userId, 10);
    const lines = referrals.length
        ? referrals.map((item) => {
            const label = item.username ? `@${escapeHtml(item.username)}` : `<code>${item.telegramId}</code>`;
            return `· ${label} · depósitos ${item.depositsCount} · comissão ${(0, format_1.formatCurrency)(item.totalCommission)}`;
        })
        : ["<i>Você ainda não tem indicados.</i>"];
    return [
        "<b>👥 Meus indicados</b>",
        "",
        ...lines,
    ].join("\n");
}
function buildAffiliateRankingText() {
    const ranking = repositories_1.repositories.listAffiliateRanking(10);
    const lines = ranking.length
        ? ranking.map((item, index) => {
            const label = item.username ? `@${escapeHtml(item.username)}` : `<code>${item.telegramId}</code>`;
            return `${medalForRank(index + 1)} ${label} · ${item.referralsCount} indicados · ${(0, format_1.formatCurrency)(item.totalCommission)}`;
        })
        : ["<i>Nenhum afiliado ranqueado ainda.</i>"];
    return [
        "<b>🏆 Ranking de afiliados</b>",
        "",
        ...lines,
    ].join("\n");
}
function buildCreatePaymentDocs() {
    const sampleRequest = `${config_1.appConfig.BASE_URL}/create_payment?user_id=7362058155&valor=10.50`;
    const sampleJson = `{
  "txid": "TX-99887766abcd",
  "pixCopiaECola": "00020126...",
  "qrcode_base64": "iVBORw0KGgoAAA...",
  "status": "ATIVA",
  "amount": 10.5,
  "taxa": 1.5,
  "valor_liquido": 9
}`;
    return [
        "<b>📤 Gerar pagamento</b>",
        "",
        "Endpoint · <code>GET /create_payment</code>",
        "",
        "<b>Parâmetros</b>",
        "<code>user_id</code> (int) - ID do usuário no Telegram",
        "<code>valor</code> (float) - Valor do pagamento (mínimo: R$ 3,00)",
        "",
        "<b>Exemplo de requisição</b>",
        `<code>${sampleRequest}</code>`,
        "",
        "<b>Exemplo de resposta (JSON)</b>",
        `<pre>${sampleJson}</pre>`,
    ].join("\n");
}
function buildVerifyPaymentDocs() {
    const sampleRequest = `${config_1.appConfig.BASE_URL}/verify_payment?payment_id=TX-99887766abcd`;
    const sampleJson = `{
  "payment_id": "TX-99887766abcd",
  "status_pagamento": "CONCLUIDA",
  "valor": 10.5,
  "valor_liquido": 9
}`;
    return [
        "<b>🔍 Verificar pagamento</b>",
        "",
        "Endpoint · <code>GET /verify_payment</code>",
        "",
        "<b>Parâmetros</b>",
        "<code>payment_id</code> (string) - O txid recebido na criação",
        "",
        "<b>Exemplo de requisição</b>",
        `<code>${sampleRequest}</code>`,
        "",
        "<b>Exemplo de resposta (JSON)</b>",
        `<pre>${sampleJson}</pre>`,
    ].join("\n");
}
async function handleTextMessage(ctx, user, text) {
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    switch (ctx.session.flow.name) {
        case "extract_search_payment_id": {
            normalizeExtractState(ctx);
            ctx.session.extractSearchId = text.trim() || undefined;
            ctx.session.extractPage = 0;
            ctx.session.flow = { name: "idle" };
            const section = ctx.session.extractSection ?? "deposits";
            if (section === "deposits") {
                const { text: messageText, total, items } = buildDepositsPage(user.id, 0, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
                await sendManagedReply(ctx, messageText, {
                    parse_mode: "HTML",
                    reply_markup: buildExtractItemsKeyboard("deposits", items, 0, total),
                });
                return;
            }
            const { text: messageText, total, items } = buildWithdrawsPage(user.id, 0, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
            await sendManagedReply(ctx, messageText, {
                parse_mode: "HTML",
                reply_markup: buildExtractItemsKeyboard("withdraws", items, 0, total),
            });
            return;
        }
        case "deposit_amount": {
            const amount = (0, format_1.parseMoneyInput)(text);
            if (!amount) {
                await sendManagedReply(ctx, [
                    "<b>💳 Novo depósito</b>",
                    "",
                    "Digite o valor em reais.",
                    "<i>Ex.: 3.50 ou 10</i>",
                ].join("\n"), { parse_mode: "HTML", reply_markup: depositKeyboard() });
                return;
            }
            try {
                const deposit = await terrorPayService_1.terrorPayService.createDeposit(user, amount);
                ctx.session.flow = { name: "idle" };
                await notifyAdminsDepositCreated(user, amount);
                const photoInput = getDepositPhotoInput(deposit);
                const caption = buildDepositCaption(deposit);
                if (photoInput) {
                    await sendManagedPhoto(ctx, photoInput, {
                        caption,
                        parse_mode: "HTML",
                    });
                }
                else {
                    await sendManagedReply(ctx, caption, {
                        parse_mode: "HTML",
                    });
                }
            }
            catch (error) {
                ctx.session.flow = { name: "idle" };
                await notifyAdminsError("deposito", error, user, {
                    etapa: "deposit_amount",
                    valor: amount,
                });
                await sendManagedReply(ctx, buildErrorMessage("PIX", error), {
                    parse_mode: "HTML",
                    reply_markup: depositKeyboard(),
                });
            }
            return;
        }
        case "withdraw_amount": {
            const amount = (0, format_1.parseMoneyInput)(text);
            if (!amount) {
                await sendManagedReply(ctx, buildWithdrawFlowIntro(user.id), {
                    parse_mode: "HTML",
                    reply_markup: withdrawKeyboard(),
                });
                return;
            }
            ctx.session.pendingWithdraw = { amount, pixKey: "" };
            ctx.session.flow = { name: "withdraw_mode" };
            await sendManagedReply(ctx, buildWithdrawModePrompt(user.id, amount), {
                parse_mode: "HTML",
                reply_markup: withdrawModeKeyboard(),
            });
            return;
        }
        case "withdraw_key":
            {
                const amount = ctx.session.pendingWithdraw?.amount ?? 0;
                const feeMode = ctx.session.pendingWithdraw?.feeMode ?? "add_fee";
                try {
                    const pixKey = text.trim();
                    const pixKeyType = detectPixKeyType(pixKey);
                    const withdraw = await terrorPayService_1.terrorPayService.requestWithdraw(user, amount, pixKey, pixKeyType, feeMode);
                    const canOfferSave = !repositories_1.repositories.hasSavedPixKey(user.id, pixKey, pixKeyType);
                    ctx.session.flow = canOfferSave ? { name: "withdraw_save_key_alias" } : { name: "idle" };
                    ctx.session.pendingWithdraw = undefined;
                    ctx.session.pendingPixKeySave = canOfferSave ? { pixKey, pixKeyType } : undefined;
                    await notifyAdminsWithdrawRequested(user, withdraw.withdrawId, withdraw.amount, withdraw.recipientAmount, withdraw.totalDebit, pixKey, withdraw.feeMode, withdraw.requiresApproval);
                    await sendManagedReply(ctx, buildWithdrawSubmittedMessage(user.id, withdraw, pixKeyType, canOfferSave), {
                        parse_mode: "HTML",
                        reply_markup: canOfferSave ? withdrawSaveKeyKeyboard() : withdrawKeyboard(),
                    });
                }
                catch (error) {
                    ctx.session.flow = { name: "withdraw_amount" };
                    ctx.session.pendingWithdraw = undefined;
                    ctx.session.pendingPixKeySave = undefined;
                    if (isProviderPendingWithdrawError(error)) {
                        await notifyAdmins([
                            "<b>⏳ Gate recusou saque direto</b>",
                            "",
                            `Cliente · ${buildUserAdminLabel(user)}`,
                            `Valor tentado · ${(0, format_1.formatCurrency)(amount)}`,
                            `Saldo cliente atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
                            "Motivo · já existe pedido de saque pendente na gate",
                            "Ação · nenhum saque local foi criado",
                        ].join("\n"));
                        await sendManagedReply(ctx, buildProviderPendingWithdrawMessage(), {
                            parse_mode: "HTML",
                            reply_markup: withdrawKeyboard(),
                        });
                        return;
                    }
                    if (isProviderInsufficientBalanceError(error)) {
                        const preview = terrorPayService_1.terrorPayService.getWithdrawPreview(user.id, amount, feeMode);
                        await notifyAdmins([
                            "<b>⚠️ Gate sem saldo para saque</b>",
                            "",
                            `Cliente · ${buildUserAdminLabel(user)}`,
                            `Valor tentado · ${(0, format_1.formatCurrency)(amount)}`,
                            `Saldo cliente atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
                            `Débito calculado · ${(0, format_1.formatCurrency)(preview.totalDebit)}`,
                            `Destinatário receberia · ${(0, format_1.formatCurrency)(preview.recipientAmount)}`,
                            `Motivo gate · ${escapeHtml(formatUserErrorMessage(error))}`,
                            "Ação · nenhum saque local foi criado",
                        ].join("\n"));
                        await sendManagedReply(ctx, buildProviderInsufficientBalanceMessage(), {
                            parse_mode: "HTML",
                            reply_markup: withdrawKeyboard(),
                        });
                        return;
                    }
                    await notifyAdminsError("saque", error, user, {
                        etapa: "withdraw_key",
                        regra: amount > terrorPayService_1.terrorPayService.getManualWithdrawApprovalThreshold() ? "aprovacao_admin" : "direto_gate",
                        ...buildWithdrawAttemptDebug(user.id, amount, feeMode),
                    });
                    await sendManagedReply(ctx, buildErrorMessage("Saque", error), {
                        parse_mode: "HTML",
                        reply_markup: withdrawKeyboard(),
                    });
                }
                return;
            }
        case "admin_global_fee": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const value = Number(text.replace(",", "."));
            if (!Number.isFinite(value) || value < 0) {
                await sendManagedReply(ctx, "<b>⚠️ Valor inválido</b>\n\nUse um número positivo.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            const mode = repositories_1.repositories.getGlobalFeeMode();
            if (mode === "fixed") {
                repositories_1.repositories.setGlobalFeeFixed(value);
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, `<b>✅ Taxa fixa</b>\n\nAtualizada para <b>R$ ${value.toFixed(2)}</b> por transação.`, {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            else {
                if (value > 100) {
                    await sendManagedReply(ctx, "<b>⚠️ Valor inválido</b>\n\nUse um número entre <b>0</b> e <b>100</b>.", {
                        parse_mode: "HTML",
                        reply_markup: adminKeyboard(),
                    });
                    return;
                }
                repositories_1.repositories.setGlobalFeePercent(value);
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, `<b>✅ Taxa global</b>\n\nAtualizada para <b>${value}%</b>.`, {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            return;
        }
        case "admin_withdraw_approval_threshold": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const amount = (0, format_1.parseMoneyInput)(text);
            if (amount === null || amount < 0) {
                await sendManagedReply(ctx, "<b>⚠️ Valor inválido</b>\n\nEnvie um valor em reais. Ex.: <code>250</code>", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setManualWithdrawApprovalThreshold(amount);
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, [
                "<b>✅ Limite de aprovação atualizado</b>",
                "",
                `Saques acima de ${(0, format_1.formatCurrency)(amount)} vão precisar de aprovação do admin.`,
                `Saques até ${(0, format_1.formatCurrency)(amount)} vão direto para a gate.`,
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_user_fee": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const [idText, feeText] = text.trim().split(/\s+/);
            const targetId = Number(idText);
            const fee = Number((feeText ?? "").replace(",", "."));
            if (!Number.isFinite(targetId) || !Number.isFinite(fee) || fee < 0 || fee > 100) {
                await sendManagedReply(ctx, "<b>⚠️ Formato inválido</b>\n\nUse: <code>ID_TELEGRAM TAXA</code>", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setUserFeePercent(targetId, fee);
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>✅ Taxa personalizada</b>\n\nUsuário <code>${targetId}</code> → <b>${fee}%</b>.`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_affiliate_percent": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const value = Number(text.replace(",", "."));
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                await sendManagedReply(ctx, "<b>⚠️ Valor inválido</b>\n\nUse um percentual entre <b>0</b> e <b>100</b>.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setAffiliateCommissionPercent(value);
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>✅ Comissão de afiliado</b>\n\nAtualizada para <b>${value}%</b> das taxas dos indicados.`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_misticpay_client_id": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const clientId = text.trim();
            if (!clientId) {
                await sendManagedReply(ctx, "<b>⚠️ Client ID inválido</b>\n\nEnvie um valor não vazio.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setSetting("misticPayClientId", clientId);
            ctx.session.flow = { name: "idle" };
            (0, logger_1.persistLog)(db_1.db, "warn", "admin.misticpay.client_id", "MisticPay Client ID atualizado pelo painel", {
                adminId: user.id,
            });
            await sendManagedReply(ctx, `<b>✅ MisticPay Client ID atualizado</b>\n\nAtual · <code>${escapeHtml(maskSecret(clientId))}</code>`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_misticpay_client_secret": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const clientSecret = text.trim();
            if (!clientSecret) {
                await sendManagedReply(ctx, "<b>⚠️ Client Secret inválido</b>\n\nEnvie um valor não vazio.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setSetting("misticPayClientSecret", clientSecret);
            ctx.session.flow = { name: "idle" };
            (0, logger_1.persistLog)(db_1.db, "warn", "admin.misticpay.client_secret", "MisticPay Client Secret atualizado pelo painel", {
                adminId: user.id,
            });
            await sendManagedReply(ctx, `<b>✅ MisticPay Client Secret atualizado</b>\n\nAtual · <code>${escapeHtml(maskSecret(clientSecret))}</code>`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_required_channel_id":
            repositories_1.repositories.setSetting("requiredChannelId", text.trim());
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>✅ ID do canal</b>\n\n<code>${escapeHtml(text.trim())}</code>`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        case "admin_required_channel_url":
            repositories_1.repositories.setSetting("requiredChannelUrl", text.trim());
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>✅ Link salvo</b>\n\n<code>${escapeHtml(text.trim())}</code>`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        case "admin_reference_chat_id":
            {
                const normalizedChatId = normalizeTelegramChatTarget(text);
                if (!normalizedChatId) {
                    await sendManagedReply(ctx, [
                        "<b>⚠️ Chat inválido</b>",
                        "",
                        "Envie um ID numérico do chat/canal ou um username público.",
                        "<i>Ex.: -1001234567890 ou @meucanal</i>",
                    ].join("\n"), {
                        parse_mode: "HTML",
                        reply_markup: adminKeyboard(),
                    });
                    return;
                }
                try {
                    const chat = await exports.bot.api.getChat(normalizedChatId);
                    repositories_1.repositories.setSetting("referenceChatId", String(chat.id));
                    ctx.session.flow = { name: "idle" };
                    await sendManagedReply(ctx, [
                        "<b>✅ Chat de referências</b>",
                        "",
                        `Destino salvo · <code>${escapeHtml(String(chat.id))}</code>`,
                        "O envio fake e o aviso de referência vão usar esse chat.",
                    ].join("\n"), {
                        parse_mode: "HTML",
                        reply_markup: adminKeyboard(),
                    });
                }
                catch (error) {
                    await sendManagedReply(ctx, [
                        "<b>❌ Não consegui acessar esse chat</b>",
                        "",
                        "Confira se o ID/username está correto e se o bot foi adicionado ao canal ou grupo.",
                        `<i>${escapeHtml(error instanceof Error ? error.message : String(error))}</i>`,
                    ].join("\n"), {
                        parse_mode: "HTML",
                        reply_markup: adminKeyboard(),
                    });
                }
                return;
            }
        case "admin_reference_cta":
            repositories_1.repositories.setSetting("referenceCallToAction", text.trim());
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>✅ Texto CTA</b>\n\n${escapeHtml(text.trim())}`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        case "admin_profit_withdraw_key": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const pixKey = text.trim();
            const pixKeyType = detectPixKeyType(pixKey);
            const feeSummary = terrorPayService_1.terrorPayService.getFeeSummary();
            if (feeSummary.availableProfitWithdraw <= 0) {
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, "<b>⚠️ Sem lucro disponível</b>\n\nAs taxas já foram sacadas ou ainda estão em processamento.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            try {
                const result = await terrorPayService_1.terrorPayService.requestProfitWithdraw(pixKey, pixKeyType, feeSummary.availableProfitWithdraw);
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, [
                    "<b>Saque de lucro solicitado</b>",
                    "",
                    `Valor - ${(0, format_1.formatCurrency)(result.amount)}`,
                    `Chave - ${pixKeyType}: ${escapeHtml(pixKey)}`,
                    `Status - ${result.status}`,
                ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
            }
            catch (error) {
                ctx.session.flow = { name: "idle" };
                await notifyAdminsError("admin_profit_withdraw", error, user);
                await sendManagedReply(ctx, buildErrorMessage("Falha no saque", error), {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            return;
        }
        case "admin_fake_announcement_amount": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const amount = (0, format_1.parseMoneyInput)(text);
            if (!amount) {
                await sendManagedReply(ctx, "<b>Valor inválido</b>\n\nEnvie um número válido.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            ctx.session.flow = { name: "idle" };
            const chatId = getReferenceChatId();
            if (!getReferenceAnnouncementsEnabled() || !chatId) {
                await sendManagedReply(ctx, "<b>Canal não configurado</b>\n\nAtive os anúncios e configure o chat ID primeiro.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            try {
                const sentAmount = await sendFakeAnnouncement(amount);
                await sendManagedReply(ctx, `<b>Anuncio fake enviado</b>\n\nValor - ${(0, format_1.formatCurrency)(sentAmount)}`, {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            catch (error) {
                await sendManagedReply(ctx, `<b>Falha ao enviar</b>\n\n${escapeHtml(error.message)}`, {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            return;
        }
        case "admin_bot_username": {
            const botUsername = normalizeTelegramUsername(text);
            if (!botUsername) {
                await sendManagedReply(ctx, "<b>Username inválido</b>\n\nEnvie um username público sem link de convite.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setSetting("botUsername", botUsername);
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, `<b>Username do bot</b>\n\n<code>@${escapeHtml(botUsername)}</code>\n\nAgora as mensagens de referência terão o botão "TerrorPay".`, {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_set_admin_username": {
            const adminUsername = normalizeTelegramUsername(text);
            if (!adminUsername) {
                await sendManagedReply(ctx, [
                    "<b>Username inválido</b>",
                    "",
                    "Envie um username válido do Telegram, com ou sem @.",
                    "<i>Ex.: suporte_oficial</i>",
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            repositories_1.repositories.setAdminUsername(adminUsername);
            ctx.session.flow = { name: "idle" };
            await sendManagedReply(ctx, [
                "<b>Suporte configurado</b>",
                "",
                `Username salvo - <code>@${escapeHtml(adminUsername)}</code>`,
                "O botão de suporte no /start agora abrirá esse contato.",
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_broadcast_message": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const messageText = text.trim();
            if (!messageText) {
                await sendManagedReply(ctx, "<b>⚠️ Mensagem inválida</b>\n\nEnvie o texto do aviso.", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            ctx.session.flow = { name: "idle" };
            const clients = repositories_1.repositories.listClientUsers();
            let sent = 0;
            let failed = 0;
            for (const client of clients) {
                try {
                    await exports.bot.api.sendMessage(client.telegramId, [
                        "<b>📨 Aviso da administração</b>",
                        "",
                        escapeHtml(messageText),
                    ].join("\n"), { parse_mode: "HTML" });
                    sent++;
                }
                catch (error) {
                    failed++;
                    (0, logger_1.persistLog)(db_1.db, "warn", "admin.broadcast", "Falha ao enviar aviso para cliente", {
                        adminId: user.id,
                        targetTelegramId: client.telegramId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            (0, logger_1.persistLog)(db_1.db, "info", "admin.broadcast", "Aviso geral enviado", {
                adminId: user.id,
                totalClients: clients.length,
                sent,
                failed,
            });
            await sendManagedReply(ctx, [
                "<b>✅ Aviso enviado</b>",
                "",
                `Clientes encontrados · ${clients.length}`,
                `Enviados · ${sent}`,
                `Falhas · ${failed}`,
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        case "admin_user_lookup": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const targetUser = repositories_1.repositories.findUserForAdminLookup(text);
            ctx.session.flow = { name: "idle" };
            if (!targetUser) {
                await sendManagedReply(ctx, [
                    "<b>❌ Usuário não encontrado</b>",
                    "",
                    "Envie o ID interno, Telegram ID ou @username de um usuário cadastrado.",
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: adminUserLookupKeyboard(),
                });
                return;
            }
            await sendAdminUserDetail(ctx, targetUser.id);
            return;
        }
        case "withdraw_save_key_alias": {
            const pendingSave = ctx.session.pendingPixKeySave;
            if (!pendingSave) {
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, "<b>⚠️ Nenhuma chave pendente para salvar</b>", {
                    parse_mode: "HTML",
                    reply_markup: withdrawKeyboard(),
                });
                return;
            }
            repositories_1.repositories.savePixKey(user.id, pendingSave.pixKey, pendingSave.pixKeyType, text.trim() || undefined);
            ctx.session.flow = { name: "idle" };
            ctx.session.pendingPixKeySave = undefined;
            await sendManagedReply(ctx, [
                "<b>✅ Chave PIX salva</b>",
                "",
                `Tipo · ${pendingSave.pixKeyType}`,
                `Chave · <code>${escapeHtml(pendingSave.pixKey)}</code>`,
                `Apelido · ${text.trim() ? escapeHtml(text.trim()) : "<i>não informado</i>"}`,
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: withdrawKeyboard(),
            });
            return;
        }
        case "admin_user_balance_adjust": {
            if (user.role !== "admin") {
                ctx.session.flow = { name: "idle" };
                return;
            }
            const targetUser = repositories_1.repositories.getUserById(ctx.session.flow.targetUserId);
            if (!targetUser) {
                ctx.session.flow = { name: "idle" };
                await sendManagedReply(ctx, "<b>❌ Usuário não encontrado</b>", {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
                return;
            }
            const trimmedText = text.trim();
            const [amountText, ...reasonParts] = trimmedText.split(/\s+/);
            const amount = parseSignedMoneyInput(amountText ?? "");
            const reason = reasonParts.join(" ").trim();
            if (amount === null) {
                await sendManagedReply(ctx, [
                    "<b>💰 Ajustar saldo</b>",
                    "",
                    `Cliente · ${targetUser.username ? `@${escapeHtml(targetUser.username)}` : `<code>${targetUser.telegramId}</code>`}`,
                    "Envie no formato:",
                    "<code>+10 motivo</code>",
                    "<code>-5.50 motivo</code>",
                    "",
                    "O motivo é opcional, mas recomendado.",
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: adminUserDetailKeyboard(targetUser.id, targetUser.isBlocked, targetUser.balanceBlocked),
                });
                return;
            }
            repositories_1.repositories.createManualBalanceAdjustment(targetUser.id, amount, user.id, reason);
            const updatedBalance = terrorPayService_1.terrorPayService.getUserBalance(targetUser.id);
            ctx.session.flow = { name: "idle" };
            (0, logger_1.persistLog)(db_1.db, "warn", "admin.user.balance_adjust", "Saldo ajustado manualmente", {
                adminId: user.id,
                targetUserId: targetUser.id,
                amount,
                reason: reason || null,
                balanceAfter: updatedBalance,
            });
            await sendManagedReply(ctx, [
                "<b>✅ Saldo ajustado</b>",
                "",
                `Cliente · ${targetUser.username ? `@${escapeHtml(targetUser.username)}` : `<code>${targetUser.telegramId}</code>`}`,
                `Ajuste · ${(0, format_1.formatCurrency)(amount)}`,
                `Saldo atual · ${(0, format_1.formatCurrency)(updatedBalance)}`,
                reason ? `Motivo · ${escapeHtml(reason)}` : "Motivo · <i>não informado</i>",
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: adminUserDetailKeyboard(targetUser.id, targetUser.isBlocked, targetUser.balanceBlocked),
            });
            return;
        }
        default:
            await sendManagedReply(ctx, "<b>👋</b>\n\nUse os botões do menu ou envie <code>/menu</code>.", {
                parse_mode: "HTML",
                reply_markup: infoKeyboard(),
            });
    }
}
exports.bot.command("start", async (ctx) => {
    const user = ensureUser(ctx);
    const referrerTelegramId = parseReferralTelegramId(ctx.match);
    if (referrerTelegramId) {
        repositories_1.repositories.setReferrerIfEligible(user.id, referrerTelegramId);
    }
    (0, logger_1.persistLog)(db_1.db, "info", "bot.start", "Usuário iniciou atendimento", {
        telegramId: user.telegramId,
        referrerTelegramId,
    });
    if (!(await enforceClientAccess(ctx, user))) {
        await deleteUserMessage(ctx);
        return;
    }
    await sendMainMenu(ctx, user);
    await deleteUserMessage(ctx);
});
exports.bot.command("menu", async (ctx) => {
    const user = ensureUser(ctx);
    if (!(await enforceClientAccess(ctx, user))) {
        await deleteUserMessage(ctx);
        return;
    }
    await sendMainMenu(ctx, user);
    await deleteUserMessage(ctx);
});
exports.bot.command("admin", async (ctx) => {
    const user = ensureUser(ctx);
    if (user.role !== "admin") {
        await sendManagedReply(ctx, "<b>⛔ Acesso restrito</b>\n\nApenas administradores.", {
            parse_mode: "HTML",
        });
        await deleteUserMessage(ctx);
        return;
    }
    await sendAdminPanel(ctx);
    await deleteUserMessage(ctx);
});
exports.bot.callbackQuery(/^menu:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "balance") {
        await terrorPayService_1.terrorPayService.reconcilePendingDeposits(user.id);
        ctx.session.extractSection = "deposits";
        ctx.session.extractPage = 0;
        ctx.session.extractStatus = "ALL";
        ctx.session.extractPeriodDays = 0;
        ctx.session.extractSearchId = undefined;
        await sendManagedReply(ctx, buildExtractHome(user.id), {
            parse_mode: "HTML",
            reply_markup: extractHomeKeyboard(),
        });
        return;
    }
    if (action === "deposit") {
        ctx.session.flow = { name: "deposit_amount" };
        await sendManagedReply(ctx, [
            "<b>💳 Novo depósito</b>",
            "",
            "Digite o valor em reais.",
            "<i>Ex.: 3.50 ou 10</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: depositKeyboard() });
        return;
    }
    if (action === "withdraw") {
        await startWithdrawFlow(ctx, user);
        return;
    }
    if (action === "fees") {
        const mode = repositories_1.repositories.getGlobalFeeMode();
        const globalFee = mode === "fixed"
            ? `R$ ${repositories_1.repositories.getGlobalFeeFixed().toFixed(2)} fixo`
            : `${repositories_1.repositories.getGlobalFeePercent()}%`;
        const userFeePercent = terrorPayService_1.terrorPayService.getUserFeePercent(user.id);
        const userFeeDisplay = mode === "fixed"
            ? `R$ ${repositories_1.repositories.getGlobalFeeFixed().toFixed(2)} fixo`
            : `${userFeePercent}%`;
        const feeMode = user.feePercent === null || mode === "fixed"
            ? "Taxa global aplicada"
            : "Taxa personalizada aplicada";
        await sendManagedReply(ctx, [
            "<b>📊 Taxas</b>",
            "",
            `Modo · ${mode === "fixed" ? "Valor fixo (R$)" : "Percentual (%)"}`,
            `Global · ${globalFee}`,
            `${feeMode} · ${userFeeDisplay}`,
            "",
            `<b>Contato</b> · ${buildAdminContactsText()}`,
        ].join("\n"), { parse_mode: "HTML", reply_markup: infoKeyboard() });
        return;
    }
    if (action === "affiliates") {
        await sendManagedReply(ctx, buildAffiliateHome(user), {
            parse_mode: "HTML",
            reply_markup: affiliateKeyboard(),
        });
        return;
    }
    if (action === "docs") {
        await sendManagedReply(ctx, buildApiDocsHome(), {
            parse_mode: "HTML",
            reply_markup: docsKeyboard(),
        });
        return;
    }
    if (action === "commands") {
        await sendManagedReply(ctx, [
            "<b>⌨️ Comandos</b>",
            "",
            "<code>/start</code> · abrir menu",
            "<code>/menu</code> · voltar ao menu",
            "<code>/admin</code> · painel (só admins)",
        ].join("\n"), { parse_mode: "HTML", reply_markup: infoKeyboard() });
        return;
    }
    if (action === "support") {
        const supportUsername = getSupportUsername();
        await sendManagedReply(ctx, supportUsername
            ? [
                "<b>Suporte</b>",
                "",
                `Contato direto · @${escapeHtml(supportUsername)}`,
                "Use o botão abaixo para abrir o atendimento.",
            ].join("\n")
            : [
                "<b>Suporte</b>",
                "",
                "O suporte ainda não foi configurado no painel admin.",
                "<i>Defina em /admin -> Username admin.</i>",
            ].join("\n"), { parse_mode: "HTML", reply_markup: supportKeyboard() });
        return;
    }
});
exports.bot.callbackQuery(/^docs:/, async (ctx) => {
    ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (action === "create_payment") {
        await sendManagedReply(ctx, buildCreatePaymentDocs(), {
            parse_mode: "HTML",
            reply_markup: docsKeyboard(),
        });
        return;
    }
    if (action === "verify_payment") {
        await sendManagedReply(ctx, buildVerifyPaymentDocs(), {
            parse_mode: "HTML",
            reply_markup: docsKeyboard(),
        });
        return;
    }
    if (action === "back") {
        const user = ensureUser(ctx);
        await sendMainMenu(ctx, user);
    }
});
exports.bot.callbackQuery(/^terms:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (!(await enforceUserAvailability(ctx, user))) {
        return;
    }
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        await sendManagedReply(ctx, buildTermsPrompt(), {
            parse_mode: "HTML",
            reply_markup: termsKeyboard(),
        });
        return;
    }
    if (action === "accept") {
        repositories_1.repositories.acceptTerms(user.id);
        const updatedUser = repositories_1.repositories.getUserById(user.id) ?? user;
        if (!(await enforceClientAccess(ctx, updatedUser))) {
            return;
        }
        await sendMainMenu(ctx, updatedUser);
    }
});
exports.bot.callbackQuery(/^extract:/, async (ctx) => {
    const user = ensureUser(ctx);
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    const parts = ctx.callbackQuery.data.split(":");
    const action = parts[1];
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        await sendMainMenu(ctx, user);
        return;
    }
    if (action === "search") {
        normalizeExtractState(ctx);
        ctx.session.flow = { name: "extract_search_payment_id" };
        await sendManagedReply(ctx, [
            "<b>🔎 Buscar por ID de pagamento</b>",
            "",
            "Envie parte do ID para localizar no extrato atual.",
            "<i>Ex.: terrorpay-deposit ou py_019...</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: extractDetailKeyboard() });
        return;
    }
    if (action === "clearsearch") {
        clearExtractSearch(ctx);
        ctx.session.extractPage = 0;
    }
    if (action === "status") {
        normalizeExtractState(ctx);
        ctx.session.extractStatus = parts[2] ?? "ALL";
        ctx.session.extractPage = 0;
    }
    if (action === "period") {
        normalizeExtractState(ctx);
        ctx.session.extractPeriodDays = Number(parts[2] ?? 0);
        ctx.session.extractPage = 0;
    }
    if (action === "return") {
        action;
    }
    if (action === "item") {
        const kind = parts[2];
        const itemId = Number(parts[3] ?? 0);
        if (kind === "d") {
            const item = repositories_1.repositories.getDepositById(itemId);
            if (!item || item.userId !== user.id) {
                await sendManagedReply(ctx, "<b>❌ Depósito não encontrado</b>", {
                    parse_mode: "HTML",
                    reply_markup: extractDetailKeyboard(),
                });
                return;
            }
            await sendManagedReply(ctx, buildDepositDetailText(item), {
                parse_mode: "HTML",
                reply_markup: extractDetailKeyboard(),
            });
            return;
        }
        if (kind === "w") {
            const item = repositories_1.repositories.getWithdrawById(itemId);
            if (!item || item.userId !== user.id) {
                await sendManagedReply(ctx, "<b>❌ Saque não encontrado</b>", {
                    parse_mode: "HTML",
                    reply_markup: extractDetailKeyboard(),
                });
                return;
            }
            await sendManagedReply(ctx, buildWithdrawDetailText(item), {
                parse_mode: "HTML",
                reply_markup: extractDetailKeyboard(),
            });
            return;
        }
    }
    if (action === "deposits") {
        const page = Number(parts[2] ?? 0);
        normalizeExtractState(ctx, "deposits");
        ctx.session.extractPage = page;
        const { text, total, items } = buildDepositsPage(user.id, page, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
        await sendManagedReply(ctx, text, {
            parse_mode: "HTML",
            reply_markup: buildExtractItemsKeyboard("deposits", items, page, total),
        });
        return;
    }
    if (action === "withdraws") {
        const page = Number(parts[2] ?? 0);
        normalizeExtractState(ctx, "withdraws");
        ctx.session.extractPage = page;
        const { text, total, items } = buildWithdrawsPage(user.id, page, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
        await sendManagedReply(ctx, text, {
            parse_mode: "HTML",
            reply_markup: buildExtractItemsKeyboard("withdraws", items, page, total),
        });
        return;
    }
    const section = ctx.session.extractSection ?? "deposits";
    const page = ctx.session.extractPage ?? 0;
    if (section === "deposits") {
        const { text, total, items } = buildDepositsPage(user.id, page, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
        await sendManagedReply(ctx, text, {
            parse_mode: "HTML",
            reply_markup: buildExtractItemsKeyboard("deposits", items, page, total),
        });
        return;
    }
    const { text, total, items } = buildWithdrawsPage(user.id, page, ctx.session.extractStatus ?? "ALL", ctx.session.extractPeriodDays ?? 0, ctx.session.extractSearchId);
    await sendManagedReply(ctx, text, {
        parse_mode: "HTML",
        reply_markup: buildExtractItemsKeyboard("withdraws", items, page, total),
    });
});
exports.bot.callbackQuery(/^deposit:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        await sendMainMenu(ctx, user);
    }
});
exports.bot.callbackQuery(/^withdraw:/, async (ctx) => {
    const user = ensureUser(ctx);
    const [, action, value] = ctx.callbackQuery.data.split(":");
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        ctx.session.pendingWithdraw = undefined;
        ctx.session.pendingPixKeySave = undefined;
        await sendMainMenu(ctx, user);
        return;
    }
    if (action === "mode") {
        const amount = ctx.session.pendingWithdraw?.amount;
        if (!amount) {
            ctx.session.flow = { name: "withdraw_amount" };
            await sendManagedReply(ctx, buildWithdrawFlowIntro(user.id), {
                parse_mode: "HTML",
                reply_markup: withdrawKeyboard(),
            });
            return;
        }
        const feeMode = value === "discount_fee" ? "discount_fee" : "add_fee";
        ctx.session.pendingWithdraw = {
            amount,
            pixKey: ctx.session.pendingWithdraw?.pixKey ?? "",
            pixKeyType: ctx.session.pendingWithdraw?.pixKeyType,
            feeMode,
        };
        ctx.session.flow = { name: "withdraw_key" };
        await sendManagedReply(ctx, buildWithdrawKeyPrompt(user.id, amount, feeMode), {
            parse_mode: "HTML",
            reply_markup: withdrawKeyKeyboard(user.id),
        });
        return;
    }
    if (action === "save_skip") {
        ctx.session.flow = { name: "idle" };
        ctx.session.pendingPixKeySave = undefined;
        await sendManagedReply(ctx, "<b>👍 Chave não salva</b>", {
            parse_mode: "HTML",
            reply_markup: withdrawKeyboard(),
        });
        return;
    }
    if (action === "use_saved") {
        const amount = ctx.session.pendingWithdraw?.amount;
        const feeMode = ctx.session.pendingWithdraw?.feeMode ?? "add_fee";
        if (!amount) {
            ctx.session.flow = { name: "withdraw_amount" };
            await sendManagedReply(ctx, buildWithdrawFlowIntro(user.id), {
                parse_mode: "HTML",
                reply_markup: withdrawKeyboard(),
            });
            return;
        }
        const savedKey = repositories_1.repositories.getSavedPixKeyForUser(user.id, Number(value));
        if (!savedKey) {
            await sendManagedReply(ctx, "<b>❌ Chave salva não encontrada</b>", {
                parse_mode: "HTML",
                reply_markup: withdrawKeyKeyboard(user.id),
            });
            return;
        }
        try {
            const withdraw = await terrorPayService_1.terrorPayService.requestWithdraw(user, amount, savedKey.pixKey, savedKey.pixKeyType, feeMode);
            ctx.session.flow = { name: "idle" };
            ctx.session.pendingWithdraw = undefined;
            ctx.session.pendingPixKeySave = undefined;
            await notifyAdminsWithdrawRequested(user, withdraw.withdrawId, withdraw.amount, withdraw.recipientAmount, withdraw.totalDebit, savedKey.pixKey, withdraw.feeMode, withdraw.requiresApproval);
            await sendManagedReply(ctx, buildWithdrawSubmittedMessage(user.id, withdraw, String(savedKey.alias ?? savedKey.pixKeyType)), {
                parse_mode: "HTML",
                reply_markup: withdrawKeyboard(),
            });
        }
        catch (error) {
            ctx.session.flow = { name: "withdraw_key" };
            if (isProviderPendingWithdrawError(error)) {
                await notifyAdmins([
                    "<b>⏳ Gate recusou saque direto</b>",
                    "",
                    `Cliente · ${buildUserAdminLabel(user)}`,
                    `Valor tentado · ${(0, format_1.formatCurrency)(amount)}`,
                    `Saldo cliente atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
                    "Motivo · já existe pedido de saque pendente na gate",
                    "Ação · nenhum saque local foi criado",
                ].join("\n"));
                await sendManagedReply(ctx, buildProviderPendingWithdrawMessage(), {
                    parse_mode: "HTML",
                    reply_markup: withdrawKeyKeyboard(user.id),
                });
                return;
            }
            if (isProviderInsufficientBalanceError(error)) {
                const preview = terrorPayService_1.terrorPayService.getWithdrawPreview(user.id, amount, feeMode);
                await notifyAdmins([
                    "<b>⚠️ Gate sem saldo para saque</b>",
                    "",
                    `Cliente · ${buildUserAdminLabel(user)}`,
                    `Valor tentado · ${(0, format_1.formatCurrency)(amount)}`,
                    `Saldo cliente atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
                    `Débito calculado · ${(0, format_1.formatCurrency)(preview.totalDebit)}`,
                    `Destinatário receberia · ${(0, format_1.formatCurrency)(preview.recipientAmount)}`,
                    `Motivo gate · ${escapeHtml(formatUserErrorMessage(error))}`,
                    "Ação · nenhum saque local foi criado",
                ].join("\n"));
                await sendManagedReply(ctx, buildProviderInsufficientBalanceMessage(), {
                    parse_mode: "HTML",
                    reply_markup: withdrawKeyKeyboard(user.id),
                });
                return;
            }
            await notifyAdminsError("saque", error, user, {
                etapa: "withdraw_saved_key",
                regra: amount > terrorPayService_1.terrorPayService.getManualWithdrawApprovalThreshold() ? "aprovacao_admin" : "direto_gate",
                ...buildWithdrawAttemptDebug(user.id, amount, feeMode),
            });
            await sendManagedReply(ctx, buildErrorMessage("Saque", error), {
                parse_mode: "HTML",
                reply_markup: withdrawKeyKeyboard(user.id),
            });
        }
        return;
    }
});
exports.bot.callbackQuery(/^info:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        await sendMainMenu(ctx, user);
    }
});
exports.bot.callbackQuery(/^affiliate:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "back") {
        ctx.session.flow = { name: "idle" };
        await sendMainMenu(ctx, user);
        return;
    }
    if (action === "referrals") {
        await sendManagedReply(ctx, buildAffiliateReferralsText(user.id), {
            parse_mode: "HTML",
            reply_markup: affiliateKeyboard(),
        });
        return;
    }
    if (action === "ranking") {
        await sendManagedReply(ctx, buildAffiliateRankingText(), {
            parse_mode: "HTML",
            reply_markup: affiliateKeyboard(),
        });
        return;
    }
});
exports.bot.callbackQuery(/^join:/, async (ctx) => {
    const user = ensureUser(ctx);
    const action = ctx.callbackQuery.data.split(":")[1];
    await ctx.answerCallbackQuery();
    if (action === "check") {
        if (await enforceClientAccess(ctx, user)) {
            await sendMainMenu(ctx, user);
        }
    }
});
exports.bot.callbackQuery(/^admin:/, async (ctx) => {
    const user = ensureUser(ctx);
    await ctx.answerCallbackQuery();
    if (user.role !== "admin") {
        await sendManagedReply(ctx, "<b>⛔</b> Somente administradores.", { parse_mode: "HTML" });
        return;
    }
    const parts = ctx.callbackQuery.data.split(":");
    const action = parts[1];
    if (action === "main_menu") {
        await sendAdminPanel(ctx);
        return;
    }
    if (action === "client_menu") {
        await sendMainMenu(ctx, user);
        return;
    }
    if (action === "section") {
        await sendAdminSection(ctx, parts[2] ?? "");
        return;
    }
    if (action === "users") {
        const users = repositories_1.repositories.listUsersWithBalance();
        const header = "<b>👥 Usuários</b> <i>(até 20)</i>\n\n";
        const lines = users.length
            ? users.slice(0, 20).map((item) => `· <code>${item.id}</code> TG ${item.telegramId} ${item.username ? `@${item.username}` : "—"} · ${(0, format_1.formatCurrency)(item.balance)}${item.isBlocked ? " · ⛔" : ""}${item.balanceBlocked ? " · 🔒 saldo" : ""}`)
            : ["<i>Nenhum usuário cadastrado.</i>"];
        await sendManagedReply(ctx, header + lines.join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminUserLookupKeyboard(),
        });
        return;
    }
    if (action === "user_lookup") {
        ctx.session.flow = { name: "admin_user_lookup" };
        await sendManagedReply(ctx, [
            "<b>🔎 Buscar usuário</b>",
            "",
            "Envie o ID interno, Telegram ID ou @username.",
            "<i>Ex.: 15, 7362058155 ou @cliente</i>",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminUserLookupKeyboard(),
        });
        return;
    }
    if (action === "withdraw_approvals") {
        await sendAdminPendingWithdrawsList(ctx);
        return;
    }
    if (action === "user") {
        const subAction = parts[2];
        const targetUserId = Number(parts[3] ?? 0);
        const targetUser = repositories_1.repositories.getUserById(targetUserId);
        if (!targetUser) {
            await sendManagedReply(ctx, "<b>❌ Usuário não encontrado</b>", {
                parse_mode: "HTML",
                reply_markup: adminUserLookupKeyboard(),
            });
            return;
        }
        if (subAction === "view") {
            await sendAdminUserDetail(ctx, targetUserId);
            return;
        }
        if (subAction === "block") {
            const next = !targetUser.isBlocked;
            repositories_1.repositories.setUserBlocked(targetUserId, next);
            (0, logger_1.persistLog)(db_1.db, "warn", "admin.user.block", next ? "Usuario bloqueado" : "Usuario desbloqueado", {
                adminId: user.id,
                targetUserId,
            });
            await sendAdminUserDetail(ctx, targetUserId);
            return;
        }
        if (subAction === "balance") {
            const next = !targetUser.balanceBlocked;
            repositories_1.repositories.setUserBalanceBlocked(targetUserId, next);
            (0, logger_1.persistLog)(db_1.db, "warn", "admin.user.balance_block", next ? "Saldo bloqueado" : "Saldo desbloqueado", {
                adminId: user.id,
                targetUserId,
            });
            await sendAdminUserDetail(ctx, targetUserId);
            return;
        }
        if (subAction === "adjust_balance") {
            ctx.session.flow = { name: "admin_user_balance_adjust", targetUserId };
            await sendManagedReply(ctx, [
                "<b>💰 Ajustar saldo do cliente</b>",
                "",
                `Cliente · ${targetUser.username ? `@${escapeHtml(targetUser.username)}` : `<code>${targetUser.telegramId}</code>`}`,
                `Saldo atual · ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(targetUserId))}`,
                "",
                "Envie no formato:",
                "<code>+10 motivo</code>",
                "<code>-5.50 motivo</code>",
                "",
                "Use valor positivo para adicionar e negativo para remover.",
            ].join("\n"), {
                parse_mode: "HTML",
                reply_markup: adminUserDetailKeyboard(targetUserId, targetUser.isBlocked, targetUser.balanceBlocked),
            });
            return;
        }
    }
    if (action === "withdraw") {
        const subAction = parts[2];
        const withdrawId = Number(parts[3] ?? 0);
        if (!Number.isFinite(withdrawId) || withdrawId <= 0) {
            await sendManagedReply(ctx, "<b>❌ Saque inválido</b>", {
                parse_mode: "HTML",
                reply_markup: adminKeyboard(),
            });
            return;
        }
        if (subAction === "view") {
            const withdraw = repositories_1.repositories.getWithdrawById(withdrawId);
            if (hasValidProviderTransactionId(withdraw?.providerTransactionId)) {
                try {
                    await terrorPayService_1.terrorPayService.refreshWithdrawStatus(withdraw);
                }
                catch (error) {
                    (0, logger_1.persistLog)(db_1.db, "warn", "admin.withdraw.refresh", "Falha ao atualizar saque pelo admin", {
                        withdrawId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            const refreshedWithdraw = repositories_1.repositories.getWithdrawById(withdrawId);
            await sendManagedReply(ctx, buildPendingWithdrawApprovalText(withdrawId), {
                parse_mode: "HTML",
                reply_markup: refreshedWithdraw
                    ? adminWithdrawApprovalKeyboard(withdrawId, refreshedWithdraw)
                    : adminKeyboard(),
            });
            return;
        }
        if (subAction === "approve") {
            try {
                const result = await terrorPayService_1.terrorPayService.approveWithdrawByAdmin(withdrawId, user.id);
                if (result.user) {
                    await exports.bot.api.sendMessage(result.user.telegramId, [
                        "<b>✅ Saque aprovado</b>",
                        "",
                        "Seu saque foi aprovado pelo admin e enviado para processamento.",
                        `Valor · ${(0, format_1.formatCurrency)(result.amount)}`,
                        `Chave PIX · ${escapeHtml(result.pixKey)}`,
                    ].join("\n"), { parse_mode: "HTML" });
                }
                await sendManagedReply(ctx, [
                    "<b>✅ Saque aprovado</b>",
                    "",
                    `Valor · ${(0, format_1.formatCurrency)(result.amount)}`,
                    `Taxa · ${(0, format_1.formatCurrency)(result.feeAmount)}`,
                    `Débito total · ${(0, format_1.formatCurrency)(result.totalDebit)}`,
                    `Status do provedor · ${escapeHtml(result.status)}`,
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            catch (error) {
                const withdraw = repositories_1.repositories.getWithdrawById(withdrawId);
                await sendManagedReply(ctx, [
                    buildErrorMessage("Aprovação de saque", error),
                    "",
                    withdraw && canAdminSendOrCancelWithdraw(withdraw)
                        ? "A gate recusou o envio. Se esse saque não subiu lá, use Excluir/Estornar para devolver o saldo do cliente."
                        : "Atualize a lista para conferir o status atual do saque.",
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: withdraw ? adminWithdrawApprovalKeyboard(withdrawId, withdraw) : adminKeyboard(),
                });
            }
            return;
        }
        if (subAction === "reject") {
            try {
                const currentWithdraw = repositories_1.repositories.getWithdrawById(withdrawId);
                const isManualApproval = String(currentWithdraw?.status ?? "").trim().toUpperCase() === "AGUARDANDO_APROVACAO";
                const withdraw = isManualApproval
                    ? terrorPayService_1.terrorPayService.rejectWithdrawByAdmin(withdrawId, user.id)
                    : terrorPayService_1.terrorPayService.cancelWithdrawByAdmin(withdrawId, user.id);
                const targetUser = repositories_1.repositories.getUserById(Number(withdraw.userId));
                if (targetUser) {
                    await exports.bot.api.sendMessage(targetUser.telegramId, [
                        `<b>${isManualApproval ? "❌ Saque rejeitado" : "↩️ Saque estornado"}</b>`,
                        "",
                        isManualApproval
                            ? `Seu saque acima de ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getManualWithdrawApprovalThreshold())} não foi aprovado pela administração.`
                            : "Seu saque não foi gerado na adquirente e o saldo foi devolvido.",
                        `Valor reservado devolvido · ${(0, format_1.formatCurrency)(Number(withdraw.totalDebit))}`,
                    ].join("\n"), { parse_mode: "HTML" });
                }
                await sendManagedReply(ctx, [
                    `<b>${isManualApproval ? "❌ Saque rejeitado" : "↩️ Saque excluído/estornado"}</b>`,
                    "",
                    `Valor reservado devolvido · ${(0, format_1.formatCurrency)(Number(withdraw.totalDebit))}`,
                ].join("\n"), {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            catch (error) {
                await sendManagedReply(ctx, buildErrorMessage("Rejeição de saque", error), {
                    parse_mode: "HTML",
                    reply_markup: adminKeyboard(),
                });
            }
            return;
        }
    }
    if (action === "logs") {
        const logs = repositories_1.repositories.listRecentLogs();
        const header = "<b>📋 Logs recentes</b>\n\n";
        const lines = logs.length
            ? logs.map((item) => `· ${(0, format_1.formatDate)(item.createdAt)} <code>${escapeHtml(item.level)}</code> ${escapeHtml(item.context)}\n  ${escapeHtml(item.message)}`)
            : ["<i>Sem registros ainda.</i>"];
        await sendManagedReply(ctx, header + lines.join("\n\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "broadcast") {
        ctx.session.flow = { name: "admin_broadcast_message" };
        const totalClients = repositories_1.repositories.listClientUsers().length;
        await sendManagedReply(ctx, [
            "<b>📨 Aviso geral</b>",
            "",
            `Clientes cadastrados · ${totalClients}`,
            "",
            "Envie a mensagem que será disparada para todos os clientes cadastrados.",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "gate_stats") {
        const feeSummary = terrorPayService_1.terrorPayService.getFeeSummary();
        const mode = repositories_1.repositories.getGlobalFeeMode();
        let gateLine;
        try {
            const bal = await terrorPayService_1.terrorPayService.getProviderBalance();
            gateLine = `<b>Saldo na conta (MisticPay)</b>\n${(0, format_1.formatCurrency)(bal)}`;
        }
        catch (error) {
            gateLine = `<b>Saldo na conta (MisticPay)</b>\n<i>Indisponível: ${escapeHtml(error instanceof Error ? error.message : String(error))}</i>`;
        }
        await sendManagedReply(ctx, [
            "<b>💰 Gate e taxas</b>",
            "",
            gateLine,
            "",
            `Modo de taxa · <b>${mode === "fixed" ? `Fixo · R$ ${repositories_1.repositories.getGlobalFeeFixed().toFixed(2)}` : `Percentual · ${repositories_1.repositories.getGlobalFeePercent()}%`}</b>`,
            "",
            "<b>Taxas acumuladas (registradas no sistema)</b>",
            `· PIX confirmados · ${(0, format_1.formatCurrency)(feeSummary.depositFees)}`,
            `· Saques concluídos · ${(0, format_1.formatCurrency)(feeSummary.withdrawFees)}`,
            `· <b>Total bruto</b> · ${(0, format_1.formatCurrency)(feeSummary.grossFees)}`,
            "",
            "<b>Lucro de taxas</b>",
            `· Já sacado/processando · ${(0, format_1.formatCurrency)(feeSummary.reservedProfitWithdraws)}`,
            `· Já concluído · ${(0, format_1.formatCurrency)(feeSummary.completedProfitWithdraws)}`,
            `· <b>Disponível agora</b> · ${(0, format_1.formatCurrency)(feeSummary.availableProfitWithdraw)}`,
            "",
            "<i>Saques de lucro abatem o disponível para evitar sacar a mesma taxa duas vezes.</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
        return;
    }
    if (action === "ranking_balance") {
        const ranked = repositories_1.repositories.listUsersRankedByBalance(25);
        const header = "<b>🏆 Ranking de saldos</b> <i>(clientes · top 25)</i>\n\n";
        const lines = ranked.length
            ? ranked.map((item, index) => {
                const rank = index + 1;
                const label = `${medalForRank(rank)} ${item.username ? `@${escapeHtml(item.username)}` : `TG ${item.telegramId}`}`;
                return `${label} · ${(0, format_1.formatCurrency)(item.balance)}`;
            })
            : ["<i>Nenhum cliente com saldo positivo ainda.</i>"];
        await sendManagedReply(ctx, header + lines.join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "global_fee") {
        ctx.session.flow = { name: "admin_global_fee" };
        const mode = repositories_1.repositories.getGlobalFeeMode();
        await sendManagedReply(ctx, `<b>💹 Taxa global</b>\n\nModo atual · <b>${mode === "fixed" ? "Valor fixo (R$)" : "Percentual (%)"}</b>\n\nEnvie o valor (0–100 para %, ou valor em R$ para fixo).`, {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "withdraw_approval_threshold") {
        ctx.session.flow = { name: "admin_withdraw_approval_threshold" };
        const current = terrorPayService_1.terrorPayService.getManualWithdrawApprovalThreshold();
        await sendManagedReply(ctx, [
            "<b>🛡️ Limite para aprovação manual</b>",
            "",
            `Atual · <b>${(0, format_1.formatCurrency)(current)}</b>`,
            "",
            "Envie o novo valor em reais.",
            "Saques até esse valor vão direto para a gate.",
            "Saques acima desse valor aguardam aprovação do admin.",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "user_fee") {
        ctx.session.flow = { name: "admin_user_fee" };
        await sendManagedReply(ctx, "<b>🎯 Taxa por usuário</b>\n\nFormato:\n<code>ID_TELEGRAM TAXA</code>\n\n<i>Ex.: 7362058155 2.5</i>", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "toggle_affiliates") {
        const next = !repositories_1.repositories.getAffiliatesEnabled();
        repositories_1.repositories.setAffiliatesEnabled(next);
        await sendManagedReply(ctx, `<b>🤝 Afiliados</b>\n\n${next ? "✅ Ativado" : "⏸️ Desativado"}.`, { parse_mode: "HTML", reply_markup: adminKeyboard() });
        return;
    }
    if (action === "affiliate_percent") {
        ctx.session.flow = { name: "admin_affiliate_percent" };
        await sendManagedReply(ctx, [
            "<b>💼 Comissão de afiliado</b>",
            "",
            `Atual · <b>${repositories_1.repositories.getAffiliateCommissionPercent()}%</b> das taxas dos indicados.`,
            "",
            "Envie o novo percentual entre 0 e 100.",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "set_misticpay_client_id") {
        ctx.session.flow = { name: "admin_misticpay_client_id" };
        const current = repositories_1.repositories.getMisticPayClientId(config_1.appConfig.MISTICPAY_CLIENT_ID);
        await sendManagedReply(ctx, [
            "<b>🪪 MisticPay Client ID</b>",
            "",
            `Atual · <code>${escapeHtml(maskSecret(current))}</code>`,
            "Envie o novo Client ID.",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "set_misticpay_client_secret") {
        ctx.session.flow = { name: "admin_misticpay_client_secret" };
        const current = repositories_1.repositories.getMisticPayClientSecret(config_1.appConfig.MISTICPAY_CLIENT_SECRET);
        await sendManagedReply(ctx, [
            "<b>🔐 MisticPay Client Secret</b>",
            "",
            `Atual · <code>${escapeHtml(maskSecret(current))}</code>`,
            "Envie o novo Client Secret.",
        ].join("\n"), {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "toggle_required_channel") {
        const next = !getRequiredChannelEnabled();
        repositories_1.repositories.setBooleanSetting("requireChannelJoin", next);
        await sendManagedReply(ctx, `<b>📢 Canal obrigatório</b>\n\n${next ? "✅ Ativado" : "⏸️ Desativado"}.`, { parse_mode: "HTML", reply_markup: adminKeyboard() });
        return;
    }
    if (action === "toggle_terms") {
        const next = !getTermsRequiredEnabled();
        repositories_1.repositories.setBooleanSetting("requireTermsAcceptance", next);
        await sendManagedReply(ctx, `<b>📄 Aceite de termos</b>\n\n${next ? "✅ Ativado" : "⏸️ Desativado"}.`, { parse_mode: "HTML", reply_markup: adminKeyboard() });
        return;
    }
    if (action === "set_required_channel_id") {
        ctx.session.flow = { name: "admin_required_channel_id" };
        await sendManagedReply(ctx, "<b>🆔 ID do canal</b>\n\nEnvie o ID numérico ou <code>@username</code> do canal.", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "set_required_channel_url") {
        ctx.session.flow = { name: "admin_required_channel_url" };
        await sendManagedReply(ctx, "<b>🔗 Link do canal</b>\n\nEnvie a URL pública (convite) do canal.", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "toggle_reference_announcements") {
        const next = !getReferenceAnnouncementsEnabled();
        repositories_1.repositories.setBooleanSetting("referenceAnnouncementsEnabled", next);
        await sendManagedReply(ctx, `<b>✨ Referências</b>\n\n${next ? "✅ Anúncios ativos" : "⏸️ Anúncios pausados"}.`, { parse_mode: "HTML", reply_markup: adminKeyboard() });
        return;
    }
    if (action === "set_reference_chat_id") {
        ctx.session.flow = { name: "admin_reference_chat_id" };
        await sendManagedReply(ctx, "<b>💬 Chat de referências</b>\n\nEnvie o ID ou <code>@username</code> do canal/grupo onde os avisos serão publicados.", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "fee_mode_percent") {
        repositories_1.repositories.setGlobalFeeMode("percent");
        await sendManagedReply(ctx, `<b>✅ Modo de taxa</b>\n\nAlterado para <b>Percentual (%)</b>.\n\nUse "💹 Taxa global" para definir o percentual.`, {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "fee_mode_fixed") {
        repositories_1.repositories.setGlobalFeeMode("fixed");
        await sendManagedReply(ctx, `<b>✅ Modo de taxa</b>\n\nAlterado para <b>Valor fixo (R$)</b>.\n\nUse "💹 Taxa global" para definir o valor em reais.`, {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "set_reference_cta") {
        ctx.session.flow = { name: "admin_reference_cta" };
        await sendManagedReply(ctx, "<b>✍️ Texto CTA</b>\n\nEnvie o texto que aparece no final de cada anúncio de pagamento confirmado.", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
    }
    if (action === "set_bot_username") {
        ctx.session.flow = { name: "admin_bot_username" };
        await sendManagedReply(ctx, "<b>🤖 Username do bot</b>\n\nEnvie o username do bot (sem @) para aparecer no botão das mensagens de referência.\n\n<i>Ex.: terrorpay_bot</i>", {
            parse_mode: "HTML",
            reply_markup: adminKeyboard(),
        });
        return;
    }
    if (action === "profit_withdraw") {
        const feeSummary = terrorPayService_1.terrorPayService.getFeeSummary();
        if (feeSummary.availableProfitWithdraw <= 0) {
            await sendManagedReply(ctx, [
                "<b>⚠️ Sem lucro disponível</b>",
                "",
                `Total bruto de taxas · ${(0, format_1.formatCurrency)(feeSummary.grossFees)}`,
                `Já sacado/processando · ${(0, format_1.formatCurrency)(feeSummary.reservedProfitWithdraws)}`,
            ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
            return;
        }
        ctx.session.flow = { name: "admin_profit_withdraw_key" };
        await sendManagedReply(ctx, [
            "<b>💸 Sacar lucro (taxas)</b>",
            "",
            `Taxas de depósitos · ${(0, format_1.formatCurrency)(feeSummary.depositFees)}`,
            `Taxas de saques · ${(0, format_1.formatCurrency)(feeSummary.withdrawFees)}`,
            `Já sacado/processando · ${(0, format_1.formatCurrency)(feeSummary.reservedProfitWithdraws)}`,
            `<b>Total disponível agora · ${(0, format_1.formatCurrency)(feeSummary.availableProfitWithdraw)}</b>`,
            "",
            "Envie a chave PIX para receber todo o lucro disponível agora:",
        ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
    }
    if (action === "fake_announcement") {
        ctx.session.flow = { name: "admin_fake_announcement_amount" };
        await sendManagedReply(ctx, [
            "<b>🎭 Anúncio fake</b>",
            "",
            "Envie o valor do PIX fake para anunciar no canal.",
            "<i>Ex.: 50 ou 50.00</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
    }
    if (action === "toggle_fake_auto") {
        const current = repositories_1.repositories.getFakeAnnouncementsEnabled();
        repositories_1.repositories.setFakeAnnouncementsEnabled(!current);
        if (!current) {
            const { startFakeAnnouncements } = await import("./bot.js");
            startFakeAnnouncements();
        }
        else {
            const { stopFakeAnnouncements } = await import("./bot.js");
            stopFakeAnnouncements();
        }
        await sendManagedReply(ctx, `<b>✅ Anúncios automáticos</b>\n\n${!current ? "Ativados" : "Desativados"}`, { parse_mode: "HTML", reply_markup: adminKeyboard() });
    }
    if (action === "config_fake_auto") {
        const config = repositories_1.repositories.getFakeAnnouncementsConfig();
        await sendManagedReply(ctx, [
            "<b>⚙️ Configuração de anúncios automáticos</b>",
            "",
            `Valor mínimo · R$ ${config.minValue.toFixed(2)}`,
            `Valor máximo · R$ ${config.maxValue.toFixed(2)}`,
            `Intervalo mínimo · ${config.minInterval}s (${Math.floor(config.minInterval / 60)}min)`,
            `Intervalo máximo · ${config.maxInterval}s (${Math.floor(config.maxInterval / 60)}min)`,
            "",
            "<i>Use /admin para voltar ao painel e editar.</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
    }
    if (action === "set_admin_username") {
        ctx.session.flow = { name: "admin_set_admin_username" };
        const current = repositories_1.repositories.getAdminUsername();
        await sendManagedReply(ctx, [
            "<b>👤 Username do admin</b>",
            "",
            current ? `Atual · @${current}` : "Nenhum configurado",
            "",
            "Envie o username (sem @) para aparecer no suporte.",
        ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
    }
});
exports.bot.on("message:web_app_data", async (ctx) => {
    const user = ensureUser(ctx);
    let action = "";
    try {
        const payload = JSON.parse(ctx.message.web_app_data.data);
        action = typeof payload.action === "string" ? payload.action : "";
    }
    catch {
        action = "";
    }
    if (!(await enforceClientAccess(ctx, user))) {
        return;
    }
    if (action === "deposit") {
        ctx.session.flow = { name: "deposit_amount" };
        await sendManagedReply(ctx, [
            "<b>💳 Novo depósito</b>",
            "",
            "Digite o valor em reais.",
            "<i>Ex.: 3.50 ou 10</i>",
        ].join("\n"), { parse_mode: "HTML", reply_markup: depositKeyboard() });
        return;
    }
    if (action === "withdraw") {
        await startWithdrawFlow(ctx, user);
        return;
    }
    if (action === "extract") {
        await terrorPayService_1.terrorPayService.reconcilePendingDeposits(user.id);
        ctx.session.extractSection = "deposits";
        ctx.session.extractPage = 0;
        ctx.session.extractStatus = "ALL";
        ctx.session.extractPeriodDays = 0;
        ctx.session.extractSearchId = undefined;
        await sendManagedReply(ctx, buildExtractHome(user.id), {
            parse_mode: "HTML",
            reply_markup: extractHomeKeyboard(),
        });
        return;
    }
    if (action === "affiliates") {
        await sendManagedReply(ctx, buildAffiliateHome(user), {
            parse_mode: "HTML",
            reply_markup: affiliateKeyboard(),
        });
        return;
    }
    await sendMainMenu(ctx, user);
});
exports.bot.on("message:text", async (ctx) => {
    const user = ensureUser(ctx);
    try {
        await handleTextMessage(ctx, user, ctx.message.text);
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "bot.message", "Falha ao processar mensagem", {
            error: error instanceof Error ? error.message : String(error),
            telegramId: user.telegramId,
        });
        await notifyAdminsError("bot.message", error, user);
        ctx.session.flow = { name: "idle" };
        await sendManagedReply(ctx, buildErrorMessage("Erro", error), { parse_mode: "HTML" });
    }
    finally {
        if (!ctx.message.text.startsWith("/")) {
            await deleteUserMessage(ctx);
        }
    }
});
async function notifyWithdrawCompleted(user, amount, pixKey, status) {
    try {
        const statusEmoji = status === "COMPLETO" ? "OK" : "ERRO";
        const statusText = status === "COMPLETO" ? "concluído com sucesso" : `falhou (${status})`;
        await exports.bot.api.sendMessage(user.telegramId, [
            `<b>${statusEmoji} Saque ${statusText}</b>`,
            "",
            `Valor - ${(0, format_1.formatCurrency)(amount)}`,
            `Chave - ${escapeHtml(pixKey)}`,
        ].join("\n"), { parse_mode: "HTML" });
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "withdraw.notify", "Falha ao notificar usuário sobre saque", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    await notifyAdminsWithdrawCompleted(user, amount, pixKey, status);
    if (status === "COMPLETO") {
        await publishReferenceAnnouncement(user, amount, "withdraw");
    }
}
async function notifyDepositCompleted(user, amount) {
    try {
        await exports.bot.api.sendMessage(user.telegramId, [
            "<b>OK Depósito aprovado</b>",
            "",
            `Valor creditado - ${(0, format_1.formatCurrency)(amount)}`,
            `Saldo atual - ${(0, format_1.formatCurrency)(terrorPayService_1.terrorPayService.getUserBalance(user.id))}`,
        ].join("\n"), { parse_mode: "HTML" });
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "deposit.notify", "Falha ao notificar usuário sobre deposito", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    await notifyAdminsDepositCompleted(user, amount);
}
let fakeAnnouncementTimer = null;
async function sendFakeAnnouncement(amount) {
    const chatId = getReferenceChatId();
    if (!getReferenceAnnouncementsEnabled() || !chatId) {
        throw new Error("Ative os anúncios de referência e configure um chat válido primeiro.");
    }
    const config = repositories_1.repositories.getFakeAnnouncementsConfig();
    const kind = Math.random() < 0.5 ? "deposit" : "withdraw";
    const depositMin = Math.max(5, Math.min(config.minValue, 99.9));
    const depositMax = Math.max(depositMin, Math.min(config.maxValue, 99.9));
    const withdrawMin = Math.max(5, Math.min(config.minValue, 99.9));
    const withdrawMax = Math.max(withdrawMin, Math.min(config.maxValue, 99.9));
    const randomMin = kind === "deposit" ? depositMin : withdrawMin;
    const randomMax = kind === "deposit" ? depositMax : withdrawMax;
    const resolvedAmount = amount ?? (Math.random() * (randomMax - randomMin) + randomMin);
    const roundedAmount = Math.round(Math.min(resolvedAmount, 99.9) * 100) / 100;
    const botUsername = getReferenceBotUsername();
    const keyboard = new grammy_1.InlineKeyboard();
    if (botUsername) {
        keyboard.url(`🚀 ${getReferenceBotLabel()}`, `https://t.me/${botUsername}`);
    }
    await exports.bot.api.sendMessage(chatId, buildFakeReferenceAnnouncement(roundedAmount, kind), {
        parse_mode: "HTML",
        reply_markup: keyboard,
    });
    (0, logger_1.persistLog)(db_1.db, "info", "fake.announcement", "Anuncio fake enviado", {
        amount: roundedAmount,
        chatId,
        kind,
    });
    return roundedAmount;
}
function scheduleFakeAnnouncement() {
    if (fakeAnnouncementTimer) {
        clearTimeout(fakeAnnouncementTimer);
    }
    if (!repositories_1.repositories.getFakeAnnouncementsEnabled()) {
        return;
    }
    const config = repositories_1.repositories.getFakeAnnouncementsConfig();
    const minInterval = Math.max(config.minInterval, 180);
    const maxInterval = Math.max(config.maxInterval, minInterval, 900);
    const intervalSeconds = Math.floor(Math.random() * (maxInterval - minInterval + 1) + minInterval);
    console.log(`[fake] próximo anuncio em ${intervalSeconds}s`);
    fakeAnnouncementTimer = setTimeout(async () => {
        try {
            const roundedAmount = await sendFakeAnnouncement();
            console.log(`[fake] anuncio enviado: R$ ${roundedAmount.toFixed(2)}`);
        }
        catch (error) {
            console.error("[fake] erro ao enviar anuncio:", error);
            (0, logger_1.persistLog)(db_1.db, "error", "fake.announcement", "Falha ao enviar anuncio fake", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        scheduleFakeAnnouncement();
    }, intervalSeconds * 1000);
}
function startFakeAnnouncements() {
    console.log("[fake] iniciando sistema de anúncios automáticos");
    sendFakeAnnouncement()
        .then((amount) => {
        console.log(`[fake] anuncio imediato enviado: R$ ${amount.toFixed(2)}`);
    })
        .catch((error) => {
        console.error("[fake] erro ao enviar anuncio imediato:", error);
        (0, logger_1.persistLog)(db_1.db, "error", "fake.announcement", "Falha ao enviar anuncio fake imediato", {
            error: error instanceof Error ? error.message : String(error),
        });
    })
        .finally(() => {
        scheduleFakeAnnouncement();
    });
}
function stopFakeAnnouncements() {
    if (fakeAnnouncementTimer) {
        clearTimeout(fakeAnnouncementTimer);
        fakeAnnouncementTimer = null;
        console.log("[fake] sistema de anúncios parado");
    }
}
exports.bot.catch((error) => {
    const message = error.error instanceof Error ? error.error.message : "Erro desconhecido no bot";
    (0, logger_1.persistLog)(db_1.db, "error", "bot.catch", "Erro global do bot", {
        error: message,
    });
    void notifyAdminsError("bot.catch", message);
});
async function publishReferenceAnnouncement(user, amount, kind = "deposit") {
    const chatId = getReferenceChatId();
    if (!getReferenceAnnouncementsEnabled() || !chatId) {
        return;
    }
    const botUsername = getReferenceBotUsername();
    const keyboard = new grammy_1.InlineKeyboard();
    if (botUsername) {
        keyboard.url(`🚀 ${getReferenceBotLabel()}`, `https://t.me/${botUsername}`);
    }
    try {
        await exports.bot.api.sendMessage(chatId, buildReferenceAnnouncement(user, amount, kind), {
            parse_mode: "HTML",
            reply_markup: keyboard,
        });
    }
    catch (error) {
        (0, logger_1.persistLog)(db_1.db, "error", "reference.publish", "Falha ao publicar referência", {
            chatId,
            userId: user.id,
            error: error instanceof Error ? error.message : "erro desconhecido",
        });
    }
}
