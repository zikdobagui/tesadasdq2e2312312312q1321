"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMiniAppRoutes = registerMiniAppRoutes;
const node_crypto_1 = require("node:crypto");
const config_1 = require("./config");
const repositories_1 = require("./repositories");
const terrorPayService_1 = require("./services/terrorPayService");
function verifyTelegramInitData(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    const rawUser = params.get("user");
    if (!hash || !rawUser) {
        return null;
    }
    params.delete("hash");
    const dataCheckString = [...params.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
    const secret = (0, node_crypto_1.createHmac)("sha256", "WebAppData")
        .update(config_1.appConfig.BOT_TOKEN)
        .digest();
    const calculatedHash = (0, node_crypto_1.createHmac)("sha256", secret)
        .update(dataCheckString)
        .digest("hex");
    const provided = Buffer.from(hash, "hex");
    const calculated = Buffer.from(calculatedHash, "hex");
    if (provided.length !== calculated.length || !(0, node_crypto_1.timingSafeEqual)(provided, calculated)) {
        return null;
    }
    try {
        const user = JSON.parse(rawUser);
        return Number.isFinite(user.id) ? user : null;
    }
    catch {
        return null;
    }
}
function getInitDataFromRequest(req) {
    const auth = req.header("authorization") ?? "";
    if (/^tma\s+/i.test(auth)) {
        return auth.replace(/^tma\s+/i, "").trim();
    }
    return typeof req.query.initData === "string" ? req.query.initData : "";
}
function resolveMiniAppUser(req) {
    const verifiedUser = verifyTelegramInitData(getInitDataFromRequest(req));
    if (verifiedUser) {
        const fullName = [verifiedUser.first_name, verifiedUser.last_name]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(" ");
        return {
            telegramId: verifiedUser.id,
            username: verifiedUser.username ?? null,
            displayName: fullName || verifiedUser.username || null,
            photoUrl: verifiedUser.photo_url ?? null,
            verified: true,
        };
    }
    const baseUrl = config_1.appConfig.BASE_URL.toLowerCase();
    const allowLocalPreview = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
    const telegramId = Number(req.query.telegram_id);
    if (allowLocalPreview && Number.isFinite(telegramId)) {
        return {
            telegramId,
            username: null,
            displayName: "Cliente TerrorPay",
            photoUrl: null,
            verified: false,
        };
    }
    return null;
}
function depositStatusLabel(status) {
    const labels = {
        COMPLETO: "Aprovado",
        PENDENTE: "Pendente",
        QUEUED: "Processando",
        EXPIRADO: "Expirado",
        CANCELADO: "Cancelado",
        FALHA: "Falhou",
    };
    return labels[String(status).toUpperCase()] ?? status;
}
function withdrawStatusLabel(status) {
    const labels = {
        COMPLETO: "Aprovado",
        AGUARDANDO_APROVACAO: "Em analise",
        APROVANDO: "Enviando",
        PENDENTE: "Pendente",
        PENDING: "Pendente",
        QUEUED: "Processando",
        CANCELADO: "Cancelado",
        FALHA: "Falhou",
        FALHA_REEMBOLSADA: "Estornado",
        REJEITADO: "Rejeitado",
    };
    return labels[String(status).toUpperCase()] ?? status;
}
function buildAffiliateLink(telegramId) {
    const botUsername = repositories_1.repositories.getSetting("botUsername")?.trim();
    if (!botUsername) {
        return null;
    }
    return `https://t.me/${botUsername.replace(/^@/, "")}?start=ref_${telegramId}`;
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
    if (remainder === 10)
        remainder = 0;
    if (remainder !== Number(digits[9]))
        return false;
    sum = 0;
    for (let index = 0; index < 10; index++) {
        sum += Number(digits[index]) * (11 - index);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10)
        remainder = 0;
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
        return digits.length === 11 && isValidCpf(digits) ? "CPF" : "TELEFONE";
    }
    return "CHAVE_ALEATORIA";
}
function maskPixKeyForApp(pixKey) {
    const trimmed = pixKey.trim();
    if (trimmed.length <= 8) {
        return trimmed;
    }
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
function resolveMiniAppUserRecord(req) {
    const resolved = resolveMiniAppUser(req);
    if (!resolved) {
        return null;
    }
    return {
        user: repositories_1.repositories.upsertUser(resolved.telegramId, resolved.username, "client"),
        displayName: resolved.displayName,
        photoUrl: resolved.photoUrl,
        verified: resolved.verified,
    };
}
function miniAppHtml() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>TerrorPay Mini App</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b0d;
      --panel: #111518;
      --panel-2: #171d20;
      --panel-3: #f2f7f3;
      --text: #f7faf8;
      --ink: #0a1110;
      --muted: #9aa6a1;
      --line: rgba(236, 248, 241, .10);
      --line-strong: rgba(236, 248, 241, .18);
      --accent: #35c982;
      --accent-2: #b8e8cd;
      --cyan: #78dcca;
      --gold: #d8b76a;
      --danger: #f36b75;
      --radius: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes softPulse {
      0%, 100% { transform: scale(1); opacity: .95; }
      50% { transform: scale(1.04); opacity: 1; }
    }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(53, 201, 130, .10) 0, transparent 260px),
        radial-gradient(circle at 84% -10%, rgba(184, 232, 205, .13), transparent 290px),
        var(--tg-theme-bg-color, var(--bg));
      color: var(--tg-theme-text-color, var(--text));
    }
    button, input { font: inherit; }
    .shell {
      width: min(1240px, 100%);
      margin: 0 auto;
      padding: calc(12px + env(safe-area-inset-top)) 12px calc(24px + env(safe-area-inset-bottom));
    }
    .topbar { display: none; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 20px; line-height: 1.1; letter-spacing: 0; }
    h2 { letter-spacing: 0; }
    .subtitle, .muted { color: var(--tg-theme-hint-color, var(--muted)); }
    .subtitle { font-size: 12px; margin-top: 3px; }
    .pill {
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      padding: 8px 11px;
      color: var(--text);
      font-size: 12px;
      white-space: nowrap;
      background: rgba(255, 255, 255, .07);
    }
    .status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 99px;
      margin-right: 7px;
      background: var(--accent);
      box-shadow: 0 0 14px rgba(53, 201, 130, .65);
    }
    .hero {
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 24px;
      background:
        linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.03)),
        linear-gradient(155deg, #20302b 0%, #14221e 44%, #0f1718 100%);
      padding: 18px 16px 18px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 22px 70px rgba(0, 0, 0, .32);
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 88% 12%, rgba(53,201,130,.22), transparent 25%),
        linear-gradient(115deg, transparent 0 58%, rgba(255,255,255,.055) 58% 100%);
      opacity: .9;
    }
    .hero > * { position: relative; z-index: 1; }
    .hero-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
    }
    .hero-note {
      display: grid;
      gap: 5px;
      justify-items: end;
      text-align: right;
    }
    .balance-label { color: var(--muted); font-size: 12px; }
    .hero .balance-label,
    .hero .subtitle,
    .hero .muted { color: rgba(255,255,255,.78); }
    .balance {
      font-size: clamp(30px, 6vw, 46px);
      line-height: 1;
      font-weight: 850;
      letter-spacing: 0;
      margin: 6px 0 0;
      color: white;
    }
    .hero .metric strong { color: white; }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .metric {
      min-height: 58px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(24, 31, 34, .82);
      padding: 9px 10px;
    }
    .hero .metric {
      background: rgba(255,255,255,.075);
      border-color: rgba(255,255,255,.14);
    }
    .metric span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .07em;
    }
    .hero .metric span { color: rgba(255,255,255,.72); }
    .metric strong { display: block; font-size: 16px; margin-top: 4px; letter-spacing: 0; }
    .dashboard {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(260px, .5fr);
      gap: 10px;
      margin-bottom: 10px;
      animation: fadeUp .48s ease both;
    }
    .quick {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .action {
      min-height: 66px;
      border: 1px solid rgba(236,248,241,.12);
      border-radius: 18px;
      background: linear-gradient(180deg, #f8fbf8, #eaf3ed);
      color: var(--ink);
      display: grid;
      grid-template-columns: 34px 1fr;
      align-items: center;
      justify-items: start;
      gap: 9px;
      padding: 10px;
      cursor: pointer;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      box-shadow: 0 14px 36px rgba(0, 0, 0, .22);
    }
    .action:hover {
      border-color: rgba(20, 200, 113, .34);
      transform: translateY(-2px);
      box-shadow: 0 18px 42px rgba(0, 0, 0, .28);
    }
    .action:active { transform: translateY(1px); }
    .action-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--radius);
      display: grid;
      place-items: center;
      background: rgba(53, 201, 130, .12);
      border: 1px solid rgba(53, 201, 130, .22);
      color: #168151;
      font-size: 18px;
      font-weight: 900;
    }
    .action b { font-size: 14px; }
    .action b,
    .action small { display: block; }
    .action small { color: #5e7369; font-size: 11px; line-height: 1.25; margin-top: 2px; }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 10px;
    }
    .panel {
      border: 1px solid rgba(236,248,241,.11);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(19, 24, 27, .98), rgba(13, 17, 19, .98));
      overflow: hidden;
      box-shadow: 0 18px 54px rgba(0, 0, 0, .24);
      animation: fadeUp .32s ease both;
    }
    .profile-card {
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }
    .profile-main { min-width: 0; }
    .avatar {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: linear-gradient(145deg, #f7fff9, #dff4e7);
      color: #168151;
      font-weight: 900;
      overflow: hidden;
      flex: 0 0 auto;
      animation: softPulse 4.5s ease-in-out infinite;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .profile-card strong { display: block; font-size: 14px; }
    .profile-card span { color: rgba(255,255,255,.72); font-size: 12px; }
    .profile-id {
      margin-left: auto;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      padding: 7px 10px;
      color: rgba(255,255,255,.86);
      font-size: 12px;
      white-space: nowrap;
      background: rgba(255,255,255,.06);
    }
    .panel-head {
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.025);
    }
    .panel-head h2 { font-size: 14px; }
    .list { display: grid; }
    .item {
      min-height: 54px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--line);
    }
    .item:hover { background: rgba(255, 255, 255, .018); }
    .item:last-child { border-bottom: 0; }
    .item-title { font-weight: 700; font-size: 13px; }
    .item-sub { color: var(--muted); font-size: 11px; margin-top: 3px; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      margin-top: 3px;
    }
    .amount { font-weight: 800; white-space: nowrap; }
    .positive { color: #65dda0; }
    .negative { color: var(--danger); }
    .affiliate-box {
      padding: 12px;
      display: grid;
      gap: 8px;
    }
    .link {
      border: 1px dashed rgba(101, 221, 160, .42);
      border-radius: 14px;
      background: rgba(101, 221, 160, .075);
      color: var(--text);
      padding: 9px;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .copy {
      min-height: 42px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, #35c982, #a8e8c4);
      color: #07110d;
      font-weight: 850;
      cursor: pointer;
    }
    .work-panel { margin-bottom: 10px; }
    .is-hidden { display: none; }
    .work {
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .field label {
      color: var(--muted);
      font-size: 12px;
    }
    .check {
      align-items: flex-start;
      color: var(--text);
      display: flex;
      gap: 8px;
      line-height: 1.35;
    }
    .check input {
      margin-top: 2px;
    }
    .input, .select {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #0b1012;
      color: var(--text);
      padding: 0 12px;
      outline: none;
    }
    .input:focus, .select:focus {
      border-color: rgba(53, 201, 130, .48);
      box-shadow: 0 0 0 3px rgba(53, 201, 130, .08);
    }
    .submit {
      min-height: 40px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, #35c982, #a8e8c4);
      color: #07110d;
      font-weight: 850;
      cursor: pointer;
    }
    .secondary {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-2);
      color: var(--text);
      font-weight: 750;
      cursor: pointer;
    }
    .result {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-2);
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .qr {
      width: min(220px, 100%);
      border-radius: var(--radius);
      background: white;
      padding: 8px;
    }
    .state {
      min-height: 320px;
      display: grid;
      place-items: center;
      text-align: center;
      color: var(--muted);
      padding: 30px;
    }
    @media (max-width: 760px) {
      .shell { padding-left: 12px; padding-right: 12px; }
      .dashboard { grid-template-columns: 1fr; }
      .hero-top { display: grid; }
      .hero-note { justify-items: start; text-align: left; }
      .hero-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .quick { grid-template-columns: repeat(2, 1fr); }
      .action { min-height: 72px; }
      .form-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      .balance { font-size: 34px; }
      .metric strong { font-size: 14px; }
    }
    @media (max-width: 430px) {
      .hero-grid { grid-template-columns: 1fr; }
      .quick { grid-template-columns: 1fr; }
      .profile-card { align-items: flex-start; }
      .profile-id { font-size: 11px; padding: 6px 8px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section id="app" class="state">Carregando sua conta...</section>
  </main>
  <script>
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const root = document.getElementById("app");
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const params = new URLSearchParams(location.search);
    const localId = params.get("telegram_id");
    const authQuery = localId ? "?telegram_id=" + encodeURIComponent(localId) : "";
    let currentData = null;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
      }[char]));
    }

    async function apiFetch(path, options = {}) {
      const response = await fetch(path + authQuery, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(tg?.initData ? { Authorization: "tma " + tg.initData } : {}),
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel concluir a operacao.");
      }
      return data;
    }

    function notify(message) {
      if (tg?.showPopup) {
        tg.showPopup({ title: "TerrorPay", message, buttons: [{ type: "ok" }] });
      } else {
        alert(message);
      }
    }

    function setWorkPanel(html) {
      const panel = document.getElementById("workPanel");
      if (panel) {
        panel.classList.remove("is-hidden");
        panel.innerHTML = html;
      }
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function itemHtml(item, kind) {
      const isDeposit = kind === "deposit";
      const amount = Number(item.amount ?? 0);
      return '<div class="item">' +
        '<div><div class="item-title">' + escapeHtml(isDeposit ? "Deposito PIX" : "Saque PIX") + '</div>' +
        '<div class="status"><span class="status-dot"></span>' + escapeHtml(item.statusLabel) + ' · ' + date.format(new Date(item.createdAt)) + '</div></div>' +
        '<div class="amount ' + (isDeposit ? "positive" : "negative") + '">' + (isDeposit ? "+" : "-") + money.format(amount) + '</div>' +
      '</div>';
    }

    function initials(value) {
      const cleaned = String(value || "TP").trim();
      return cleaned
        .split(/\\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "TP";
    }

    function render(data) {
      currentData = data;
      const profileName = data.user.displayName || data.user.username || "Cliente TerrorPay";
      const profileHandle = data.user.username ? "@" + data.user.username : "ID " + data.user.telegramId;
      const avatar = data.user.photoUrl
        ? '<div class="avatar"><img src="' + escapeHtml(data.user.photoUrl) + '" alt=""></div>'
        : '<div class="avatar">' + escapeHtml(initials(profileName)) + '</div>';

      root.className = "";
      root.innerHTML =
        '<section class="dashboard">' +
          '<div class="hero">' +
            '<div class="hero-top">' +
              '<div><p class="balance-label">Saldo disponivel</p><div class="balance">' + money.format(data.balance) + '</div></div>' +
              '<div class="hero-note"><span class="pill"><span class="status-dot"></span>Conta ativa</span><p class="subtitle">PIX, saques e afiliados em tempo real</p></div>' +
            '</div>' +
            '<div class="profile-card">' +
              avatar +
              '<div class="profile-main"><strong>' + escapeHtml(profileName) + '</strong><span>' + escapeHtml(profileHandle) + '</span></div>' +
              '<div class="profile-id">ID ' + escapeHtml(data.user.telegramId) + '</div>' +
            '</div>' +
            '<div class="hero-grid">' +
              '<div class="metric"><span class="muted">Taxa</span><strong>' + escapeHtml(data.summary.feeDisplay) + '</strong></div>' +
              '<div class="metric"><span class="muted">Depositos</span><strong>' + money.format(data.totals.deposits) + '</strong></div>' +
              '<div class="metric"><span class="muted">Afiliados</span><strong>' + money.format(data.affiliate.totalCommission) + '</strong></div>' +
            '</div>' +
          '</div>' +
          '<div class="quick">' +
            '<button class="action" data-action="deposit"><span class="action-icon">+</span><span><b>Depositar</b><small>Gerar QR Code PIX</small></span></button>' +
            '<button class="action" data-action="withdraw"><span class="action-icon">↗</span><span><b>Sacar</b><small>Enviar para chave PIX</small></span></button>' +
            '<button class="action" data-action="extract"><span class="action-icon">≡</span><span><b>Extrato</b><small>Últimos movimentos</small></span></button>' +
            '<button class="action" data-action="affiliates"><span class="action-icon">%</span><span><b>Afiliados</b><small>Comissões e link</small></span></button>' +
          '</div>' +
        '</section>' +
        '<section class="panel work-panel is-hidden" id="workPanel"></section>';

      document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => openAction(button.dataset.action));
      });
    }

    function openAction(action) {
      if (action === "deposit") return openDeposit();
      if (action === "withdraw") return openWithdraw();
      if (action === "extract") return openExtract();
      if (action === "affiliates") return openAffiliates();
    }

    function openDeposit() {
      setWorkPanel(
        '<div class="panel-head"><h2>Novo depósito</h2><span class="muted">PIX</span></div>' +
        '<form class="work" id="depositForm">' +
          '<div class="field"><label>Valor em reais</label><input class="input" name="amount" inputmode="decimal" placeholder="Ex.: 10.50" required></div>' +
          '<button class="submit" type="submit">Gerar PIX</button>' +
          '<div id="operationResult"></div>' +
        '</form>'
      );
      document.getElementById("depositForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const resultBox = document.getElementById("operationResult");
        const amount = Number(new FormData(event.currentTarget).get("amount").toString().replace(",", "."));
        resultBox.innerHTML = '<div class="result"><span class="muted">Gerando PIX...</span></div>';
        try {
          const deposit = await apiFetch("/app/api/deposits", {
            method: "POST",
            body: JSON.stringify({ amount })
          });
          const qr = deposit.qrCodeBase64
            ? '<img class="qr" src="' + escapeHtml(deposit.qrCodeBase64) + '" alt="QR Code PIX">'
            : deposit.qrCodeUrl ? '<img class="qr" src="' + escapeHtml(deposit.qrCodeUrl) + '" alt="QR Code PIX">' : "";
          resultBox.innerHTML =
            '<div class="result">' +
              '<strong>PIX gerado: ' + money.format(deposit.amount) + '</strong>' +
              qr +
              '<div class="link" id="pixCode">' + escapeHtml(deposit.copyPaste || "Codigo nao informado pela integracao.") + '</div>' +
              '<button class="secondary" type="button" id="copyPix">Copiar codigo PIX</button>' +
            '</div>';
          document.getElementById("copyPix").addEventListener("click", async () => {
            await navigator.clipboard?.writeText(deposit.copyPaste || "").catch(() => {});
            notify("Codigo PIX copiado.");
          });
        } catch (error) {
          resultBox.innerHTML = '<div class="result"><strong>Falha ao gerar PIX</strong><span class="muted">' + escapeHtml(error.message) + '</span></div>';
        }
      });
    }

    function openWithdraw() {
      const termsField = currentData.user.termsAcceptedAt
        ? ""
        : '<div class="field"><label>Termos de uso</label><label class="check"><input type="checkbox" name="acceptTerms" required> <span>Confirmo que minhas transações são lícitas e autorizadas. Em caso de uso malicioso ou violação dos termos, o saldo poderá ficar bloqueado e não será estornado.</span></label></div>';
      const savedOptions = currentData.savedPixKeys.length
        ? '<div class="field"><label>Chaves salvas</label><select class="select" id="savedPixKey"><option value="">Informar nova chave</option>' +
          currentData.savedPixKeys.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml((item.alias || item.pixKeyType) + " - " + item.maskedPixKey) + '</option>').join("") +
          '</select></div>'
        : "";
      setWorkPanel(
        '<div class="panel-head"><h2>Novo saque</h2><span class="muted">PIX</span></div>' +
        '<form class="work" id="withdrawForm">' +
          '<div class="form-grid">' +
            '<div class="field"><label>Valor em reais</label><input class="input" name="amount" inputmode="decimal" placeholder="Ex.: 10.50" required></div>' +
            '<div class="field"><label>Modo da taxa</label><select class="select" name="feeMode"><option value="add_fee">Valor + taxa</option><option value="discount_fee">Descontar taxa</option></select></div>' +
          '</div>' +
          savedOptions +
          '<div class="field"><label>Chave PIX</label><input class="input" name="pixKey" placeholder="CPF, e-mail, telefone ou chave aleatoria" required></div>' +
          '<label class="check"><input type="checkbox" name="savePixKey"> <span>Salvar esta chave PIX para próximos saques</span></label>' +
          '<div class="field" id="pixAliasField" style="display:none"><label>Apelido da chave</label><input class="input" name="pixKeyAlias" placeholder="Ex.: Minha conta principal"></div>' +
          termsField +
          '<button class="submit" type="submit">Solicitar saque</button>' +
          '<div id="operationResult"></div>' +
        '</form>'
      );
      const savedSelect = document.getElementById("savedPixKey");
      const pixInput = document.querySelector("#withdrawForm input[name='pixKey']");
      savedSelect?.addEventListener("change", () => {
        const item = currentData.savedPixKeys.find((key) => String(key.id) === savedSelect.value);
        pixInput.value = item ? item.pixKey : "";
        pixInput.required = !item;
      });
      document.querySelector("#withdrawForm input[name='savePixKey']").addEventListener("change", (event) => {
        document.getElementById("pixAliasField").style.display = event.currentTarget.checked ? "grid" : "none";
      });
      document.getElementById("withdrawForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const resultBox = document.getElementById("operationResult");
        resultBox.innerHTML = '<div class="result"><span class="muted">Enviando solicitação...</span></div>';
        try {
          const withdraw = await apiFetch("/app/api/withdraws", {
            method: "POST",
            body: JSON.stringify({
              amount: Number(form.get("amount").toString().replace(",", ".")),
              pixKey: form.get("pixKey").toString(),
              feeMode: form.get("feeMode").toString(),
              acceptTerms: form.get("acceptTerms") === "on",
              savePixKey: form.get("savePixKey") === "on",
              pixKeyAlias: form.get("pixKeyAlias")?.toString() || ""
            })
          });
          resultBox.innerHTML =
            '<div class="result">' +
              '<strong>Saque solicitado</strong>' +
              '<span class="muted">Status: ' + escapeHtml(withdraw.statusLabel) + '</span>' +
              '<span>Valor enviado: ' + money.format(withdraw.amount) + '</span>' +
              '<span>Taxa: ' + money.format(withdraw.feeAmount) + '</span>' +
              '<span>Débito total: ' + money.format(withdraw.totalDebit) + '</span>' +
              (withdraw.savedPixKey ? '<span>Chave PIX salva para próximos saques.</span>' : '') +
            '</div>';
          currentData = await apiFetch("/app/api/me").catch(() => currentData);
        } catch (error) {
          resultBox.innerHTML = '<div class="result"><strong>Falha no saque</strong><span class="muted">' + escapeHtml(error.message) + '</span></div>';
        }
      });
    }

    function openExtract() {
      const deposits = currentData.deposits.map((item) => itemHtml(item, "deposit")).join("");
      const withdraws = currentData.withdraws.map((item) => itemHtml(item, "withdraw")).join("");
      setWorkPanel(
        '<div class="panel-head"><h2>Extrato</h2><span class="muted">Recentes</span></div>' +
        '<div class="list">' + (deposits || withdraws ? deposits + withdraws : '<div class="item"><div><div class="item-title">Sem movimentações</div><div class="item-sub">Nenhuma transação encontrada.</div></div></div>') + '</div>'
      );
    }

    function openAffiliates() {
      const link = currentData.affiliate.link || ("Use /start ref_" + currentData.user.telegramId);
      const recent = currentData.affiliate.lastCommissions.length
        ? currentData.affiliate.lastCommissions.map((item) => '<div class="item"><div><div class="item-title">' + money.format(item.amount) + '</div><div class="item-sub">' + escapeHtml(item.percent) + '% sobre taxa · ' + date.format(new Date(item.createdAt)) + '</div></div></div>').join("")
        : '<div class="item"><div><div class="item-title">Nenhuma comissão ainda</div><div class="item-sub">Compartilhe seu link para começar.</div></div></div>';
      setWorkPanel(
        '<div class="panel-head"><h2>Afiliados</h2><span class="muted">' + escapeHtml(currentData.affiliate.percent) + '%</span></div>' +
        '<div class="affiliate-box">' +
          '<div class="form-grid">' +
            '<div class="metric"><span class="muted">Indicados</span><strong>' + escapeHtml(currentData.affiliate.referralsCount) + '</strong></div>' +
            '<div class="metric"><span class="muted">Comissão total</span><strong>' + money.format(currentData.affiliate.totalCommission) + '</strong></div>' +
          '</div>' +
          '<div class="link">' + escapeHtml(link) + '</div>' +
          '<div class="list">' + recent + '</div>' +
        '</div>'
      );
    }

    async function boot(showLoading = true) {
      try {
        if (showLoading) {
          root.className = "state";
          root.textContent = "Carregando sua conta...";
        }
        render(await apiFetch("/app/api/me"));
      } catch (error) {
        root.className = "state";
        root.innerHTML = "<div><h1>Acesso indisponivel</h1><p class='subtitle'>" + escapeHtml(error.message) + "</p></div>";
      }
    }

    boot();
  </script>
</body>
</html>`;
}
function registerMiniAppRoutes(app) {
    app.get("/app", (_req, res) => {
        res.type("html").send(miniAppHtml());
    });
    app.get("/app/api/me", (req, res) => {
        const resolved = resolveMiniAppUserRecord(req);
        if (!resolved) {
            res.status(401).json({ ok: false, message: "Abra o Mini App pelo Telegram." });
            return;
        }
        const { user } = resolved;
        const summary = terrorPayService_1.terrorPayService.getSummary(user.id);
        const deposits = repositories_1.repositories.listDeposits(user.id, 5).map((item) => ({
            ...item,
            statusLabel: depositStatusLabel(item.status),
        }));
        const withdraws = repositories_1.repositories.listWithdraws(user.id, 5).map((item) => ({
            ...item,
            statusLabel: withdrawStatusLabel(item.status),
        }));
        const affiliate = repositories_1.repositories.getAffiliateSummary(user.id);
        const savedPixKeys = repositories_1.repositories.listSavedPixKeys(user.id).slice(0, 10).map((item) => ({
            ...item,
            maskedPixKey: maskPixKeyForApp(item.pixKey),
        }));
        res.json({
            ok: true,
            verified: resolved.verified,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                username: user.username,
                displayName: resolved.displayName,
                photoUrl: resolved.photoUrl,
                termsAcceptedAt: user.termsAcceptedAt,
            },
            balance: summary.balance,
            summary: {
                feeDisplay: summary.feeDisplay,
                feeMode: summary.feeMode,
            },
            totals: {
                deposits: deposits
                    .filter((item) => item.status === "COMPLETO")
                    .reduce((total, item) => total + Number(item.amount), 0),
                withdraws: withdraws
                    .filter((item) => item.status === "COMPLETO")
                    .reduce((total, item) => total + Number(item.amount), 0),
            },
            deposits,
            withdraws,
            savedPixKeys,
            affiliate: {
                ...affiliate,
                percent: repositories_1.repositories.getAffiliateCommissionPercent(),
                enabled: repositories_1.repositories.getAffiliatesEnabled() && !user.affiliateBlocked,
                link: buildAffiliateLink(user.telegramId),
            },
        });
    });
    app.post("/app/api/deposits", async (req, res) => {
        const resolved = resolveMiniAppUserRecord(req);
        if (!resolved) {
            res.status(401).json({ ok: false, message: "Abra o Mini App pelo Telegram." });
            return;
        }
        const amount = Number(req.body?.amount);
        if (!Number.isFinite(amount) || amount < 3) {
            res.status(400).json({ ok: false, message: "O valor minimo para deposito e R$ 3,00." });
            return;
        }
        try {
            const deposit = await terrorPayService_1.terrorPayService.createDeposit(resolved.user, amount);
            res.json({
                ok: true,
                externalId: deposit.externalId,
                amount: deposit.amount,
                feeAmount: deposit.feeAmount,
                netAmount: deposit.netAmount,
                copyPaste: deposit.copyPaste,
                qrCodeUrl: deposit.qrCodeUrl,
                qrCodeBase64: deposit.qrCodeBase64,
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                message: error instanceof Error ? error.message : "Falha ao gerar PIX.",
            });
        }
    });
    app.post("/app/api/withdraws", async (req, res) => {
        const resolved = resolveMiniAppUserRecord(req);
        if (!resolved) {
            res.status(401).json({ ok: false, message: "Abra o Mini App pelo Telegram." });
            return;
        }
        const amount = Number(req.body?.amount);
        const pixKey = String(req.body?.pixKey ?? "").trim();
        const feeMode = req.body?.feeMode === "discount_fee" ? "discount_fee" : "add_fee";
        const savePixKey = req.body?.savePixKey === true;
        const pixKeyAlias = String(req.body?.pixKeyAlias ?? "").trim();
        if (!Number.isFinite(amount) || amount <= 0) {
            res.status(400).json({ ok: false, message: "Informe um valor valido para saque." });
            return;
        }
        if (!pixKey) {
            res.status(400).json({ ok: false, message: "Informe uma chave PIX." });
            return;
        }
        if (resolved.user.balanceBlocked) {
            res.status(403).json({ ok: false, message: "Seu saldo esta bloqueado para saques." });
            return;
        }
        if (!resolved.user.termsAcceptedAt && req.body?.acceptTerms !== true) {
            res.status(403).json({ ok: false, message: "Aceite os termos de uso para continuar." });
            return;
        }
        try {
            if (!resolved.user.termsAcceptedAt) {
                repositories_1.repositories.acceptTerms(resolved.user.id);
            }
            const user = repositories_1.repositories.getUserById(resolved.user.id) ?? resolved.user;
            const pixKeyType = detectPixKeyType(pixKey);
            const withdraw = await terrorPayService_1.terrorPayService.requestWithdraw(user, amount, pixKey, pixKeyType, feeMode);
            let savedPixKey = false;
            if (savePixKey && !repositories_1.repositories.hasSavedPixKey(user.id, pixKey, pixKeyType)) {
                repositories_1.repositories.savePixKey(user.id, pixKey, pixKeyType, pixKeyAlias || undefined);
                savedPixKey = true;
            }
            res.json({
                ok: true,
                ...withdraw,
                pixKeyType,
                savedPixKey,
                statusLabel: withdrawStatusLabel(withdraw.status),
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                message: error instanceof Error ? error.message : "Falha ao solicitar saque.",
            });
        }
    });
}
