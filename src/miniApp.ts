import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request } from "express";
import { appConfig } from "./config";
import { repositories } from "./repositories";
import { terrorPayService } from "./services/terrorPayService";
import type { PixKeyType, UserRecord } from "./types";

type TelegramMiniAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

function verifyTelegramInitData(initData: string): TelegramMiniAppUser | null {
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

  const secret = createHmac("sha256", "WebAppData")
    .update(appConfig.BOT_TOKEN)
    .digest();
  const calculatedHash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const provided = Buffer.from(hash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");
  if (provided.length !== calculated.length || !timingSafeEqual(provided, calculated)) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as TelegramMiniAppUser;
    return Number.isFinite(user.id) ? user : null;
  } catch {
    return null;
  }
}

function getInitDataFromRequest(req: Request): string {
  const auth = req.header("authorization") ?? "";
  if (/^tma\s+/i.test(auth)) {
    return auth.replace(/^tma\s+/i, "").trim();
  }
  return typeof req.query.initData === "string" ? req.query.initData : "";
}

function resolveMiniAppUser(req: Request): { telegramId: number; username: string | null; verified: boolean } | null {
  const verifiedUser = verifyTelegramInitData(getInitDataFromRequest(req));
  if (verifiedUser) {
    return {
      telegramId: verifiedUser.id,
      username: verifiedUser.username ?? null,
      verified: true,
    };
  }

  const baseUrl = appConfig.BASE_URL.toLowerCase();
  const allowLocalPreview = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
  const telegramId = Number(req.query.telegram_id);
  if (allowLocalPreview && Number.isFinite(telegramId)) {
    return { telegramId, username: null, verified: false };
  }

  return null;
}

function depositStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    COMPLETO: "Aprovado",
    PENDENTE: "Pendente",
    QUEUED: "Processando",
    EXPIRADO: "Expirado",
    CANCELADO: "Cancelado",
    FALHA: "Falhou",
  };
  return labels[String(status).toUpperCase()] ?? status;
}

function withdrawStatusLabel(status: string): string {
  const labels: Record<string, string> = {
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

function buildAffiliateLink(telegramId: number): string | null {
  const botUsername = repositories.getSetting("botUsername")?.trim();
  if (!botUsername) {
    return null;
  }
  return `https://t.me/${botUsername.replace(/^@/, "")}?start=ref_${telegramId}`;
}

function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 9; index++) {
    sum += Number(digits[index]) * (10 - index);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index++) {
    sum += Number(digits[index]) * (11 - index);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(digits[10]);
}

function detectPixKeyType(pixKeyRaw: string): PixKeyType {
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

function resolveMiniAppUserRecord(req: Request): { user: UserRecord; verified: boolean } | null {
  const resolved = resolveMiniAppUser(req);
  if (!resolved) {
    return null;
  }
  return {
    user: repositories.upsertUser(resolved.telegramId, resolved.username, "client"),
    verified: resolved.verified,
  };
}

function miniAppHtml(): string {
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
      --bg: #090c0d;
      --panel: #121618;
      --panel-2: #181f22;
      --panel-3: #0e1214;
      --text: #f6fbf8;
      --muted: #94a39e;
      --line: rgba(214, 255, 238, .09);
      --line-strong: rgba(214, 255, 238, .16);
      --accent: #28e18a;
      --accent-2: #e8b956;
      --cyan: #6fd8ff;
      --danger: #ff6d72;
      --radius: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(rgba(255, 255, 255, .025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, .022) 1px, transparent 1px),
        var(--tg-theme-bg-color, var(--bg));
      background-size: 36px 36px;
      color: var(--tg-theme-text-color, var(--text));
    }
    button, input { font: inherit; }
    .shell {
      width: min(1120px, 100%);
      margin: 0 auto;
      padding: calc(18px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom));
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .mark {
      width: 42px;
      height: 42px;
      border-radius: var(--radius);
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #28e18a, #b6ffd8);
      color: #06120c;
      font-weight: 900;
      box-shadow: 0 0 0 1px rgba(40, 225, 138, .22), 0 12px 32px rgba(40, 225, 138, .16);
    }
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
      background: rgba(18, 22, 24, .8);
    }
    .eyebrow {
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 99px;
      margin-right: 7px;
      background: var(--accent);
      box-shadow: 0 0 14px rgba(40, 225, 138, .9);
    }
    .hero {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background:
        linear-gradient(135deg, rgba(40, 225, 138, .13), transparent 32%),
        linear-gradient(160deg, rgba(111, 216, 255, .08), transparent 46%),
        var(--panel);
      padding: 18px;
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 22px 70px rgba(0, 0, 0, .22);
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image: linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
      background-size: 64px 100%;
      opacity: .18;
    }
    .hero > * { position: relative; z-index: 1; }
    .hero-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }
    .hero-note {
      display: grid;
      gap: 5px;
      justify-items: end;
      text-align: right;
    }
    .balance-label { color: var(--muted); font-size: 13px; }
    .balance {
      font-size: clamp(34px, 8vw, 54px);
      line-height: 1;
      font-weight: 850;
      letter-spacing: 0;
      margin: 8px 0 0;
    }
    .status-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 18px 0 10px;
    }
    .status-item {
      min-height: 58px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(9, 12, 13, .42);
      padding: 10px;
      display: grid;
      align-content: center;
      gap: 3px;
    }
    .status-item b { font-size: 13px; }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .metric {
      min-height: 72px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(24, 31, 34, .82);
      padding: 11px;
    }
    .metric span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .07em;
    }
    .metric strong { display: block; font-size: 18px; margin-top: 6px; letter-spacing: 0; }
    .quick {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .action {
      min-height: 96px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(24,31,34,.98), rgba(14,18,20,.98));
      color: var(--text);
      display: grid;
      align-content: space-between;
      justify-items: start;
      gap: 10px;
      padding: 12px;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .action:hover { border-color: rgba(40, 225, 138, .34); }
    .action:active { transform: translateY(1px); }
    .action-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--radius);
      display: grid;
      place-items: center;
      background: rgba(40, 225, 138, .12);
      border: 1px solid rgba(40, 225, 138, .25);
      color: var(--accent);
      font-size: 18px;
      font-weight: 900;
    }
    .action b { font-size: 14px; }
    .action small { color: var(--muted); font-size: 11px; line-height: 1.25; }
    .grid {
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 16px;
    }
    .panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(18, 22, 24, .96);
      overflow: hidden;
      box-shadow: 0 18px 56px rgba(0, 0, 0, .16);
    }
    .panel-head {
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.018);
    }
    .panel-head h2 { font-size: 15px; }
    .list { display: grid; }
    .item {
      min-height: 64px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
    }
    .item:hover { background: rgba(255, 255, 255, .018); }
    .item:last-child { border-bottom: 0; }
    .item-title { font-weight: 700; font-size: 14px; }
    .item-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      margin-top: 5px;
    }
    .amount { font-weight: 800; white-space: nowrap; }
    .positive { color: var(--accent); }
    .negative { color: var(--danger); }
    .affiliate-box {
      padding: 14px;
      display: grid;
      gap: 10px;
    }
    .link {
      border: 1px dashed rgba(37, 208, 127, .45);
      border-radius: var(--radius);
      background: rgba(37, 208, 127, .08);
      color: var(--text);
      padding: 10px;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .copy {
      min-height: 42px;
      border: 0;
      border-radius: var(--radius);
      background: var(--accent);
      color: #06120c;
      font-weight: 850;
      cursor: pointer;
    }
    .work-panel { margin-bottom: 14px; }
    .work {
      padding: 14px;
      display: grid;
      gap: 12px;
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
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #0d1113;
      color: var(--text);
      padding: 0 12px;
      outline: none;
    }
    .input:focus, .select:focus {
      border-color: rgba(40, 225, 138, .5);
      box-shadow: 0 0 0 3px rgba(40, 225, 138, .08);
    }
    .submit {
      min-height: 44px;
      border: 0;
      border-radius: var(--radius);
      background: var(--accent);
      color: #06120c;
      font-weight: 850;
      cursor: pointer;
    }
    .secondary {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel-2);
      color: var(--text);
      font-weight: 750;
      cursor: pointer;
    }
    .result {
      border: 1px solid var(--line);
      border-radius: var(--radius);
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
      .hero-top { display: grid; }
      .hero-note { justify-items: start; text-align: left; }
      .hero-grid, .status-strip { grid-template-columns: 1fr; }
      .quick { grid-template-columns: repeat(2, 1fr); }
      .form-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      .balance { font-size: 40px; }
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
      if (panel) panel.innerHTML = html;
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

    function render(data) {
      currentData = data;
      const deposits = data.deposits.length
        ? data.deposits.map((item) => itemHtml(item, "deposit")).join("")
        : '<div class="item"><div><div class="item-title">Sem depositos</div><div class="item-sub">Quando entrar PIX, aparece aqui.</div></div></div>';
      const withdraws = data.withdraws.length
        ? data.withdraws.map((item) => itemHtml(item, "withdraw")).join("")
        : '<div class="item"><div><div class="item-title">Sem saques</div><div class="item-sub">Seus envios PIX ficam listados aqui.</div></div></div>';
      const affiliateLink = data.affiliate.link || ("Use /start ref_" + data.user.telegramId);

      root.className = "";
      root.innerHTML =
        '<div class="topbar">' +
          '<div class="brand"><div class="mark">TP</div><div><p class="eyebrow">Digital banking</p><h1>TerrorPay</h1><p class="subtitle">Conta PIX no Telegram</p></div></div>' +
          '<div class="pill"><span class="status-dot"></span>ID ' + escapeHtml(data.user.telegramId) + '</div>' +
        '</div>' +
        '<section class="hero">' +
          '<div class="hero-top">' +
            '<div><p class="balance-label">Saldo disponivel</p><div class="balance">' + money.format(data.balance) + '</div></div>' +
            '<div class="hero-note"><span class="pill"><span class="status-dot"></span>Conta operacional</span><p class="subtitle">PIX, saques e afiliados em tempo real</p></div>' +
          '</div>' +
          '<div class="status-strip">' +
            '<div class="status-item"><span class="muted">Segurança</span><b>Telegram WebApp</b></div>' +
            '<div class="status-item"><span class="muted">Liquidação</span><b>PIX integrado</b></div>' +
            '<div class="status-item"><span class="muted">Sessão</span><b>' + (data.verified ? "Verificada" : "Preview local") + '</b></div>' +
          '</div>' +
          '<div class="hero-grid">' +
            '<div class="metric"><span class="muted">Taxa</span><strong>' + escapeHtml(data.summary.feeDisplay) + '</strong></div>' +
            '<div class="metric"><span class="muted">Depositos</span><strong>' + money.format(data.totals.deposits) + '</strong></div>' +
            '<div class="metric"><span class="muted">Afiliados</span><strong>' + money.format(data.affiliate.totalCommission) + '</strong></div>' +
          '</div>' +
        '</section>' +
        '<section class="quick">' +
          '<button class="action" data-action="deposit"><span class="action-icon">+</span><b>Depositar</b><small>Gerar QR Code PIX</small></button>' +
          '<button class="action" data-action="withdraw"><span class="action-icon">↗</span><b>Sacar</b><small>Enviar para chave PIX</small></button>' +
          '<button class="action" data-action="extract"><span class="action-icon">≡</span><b>Extrato</b><small>Últimos movimentos</small></button>' +
          '<button class="action" data-action="affiliates"><span class="action-icon">%</span><b>Afiliados</b><small>Comissões e link</small></button>' +
        '</section>' +
        '<section class="panel work-panel" id="workPanel"><div class="panel-head"><h2>Central de operações</h2><span class="muted">Pronto</span></div><div class="work"><div class="form-grid"><div class="metric"><span>Próxima ação</span><strong>Escolha um atalho</strong></div><div class="metric"><span>Experiência</span><strong>100% web</strong></div></div><p class="subtitle">Deposite, saque, consulte extrato e acompanhe afiliados sem sair desta tela.</p></div></section>' +
        '<section class="grid">' +
          '<div class="panel"><div class="panel-head"><h2>Movimentos recentes</h2><span class="pill">PIX</span></div><div class="list">' + deposits + withdraws + '</div></div>' +
          '<aside class="panel"><div class="panel-head"><h2>Afiliados</h2><span class="pill">' + escapeHtml(data.affiliate.percent) + '%</span></div>' +
            '<div class="affiliate-box">' +
              '<div class="form-grid"><div class="metric"><span>Indicados</span><strong>' + escapeHtml(data.affiliate.referralsCount) + '</strong></div><div class="metric"><span>Ativos</span><strong>' + escapeHtml(data.affiliate.activeReferralsCount) + '</strong></div></div>' +
              '<div class="link" id="affiliateLink">' + escapeHtml(affiliateLink) + '</div>' +
              '<button class="copy" id="copyLink">Copiar link</button>' +
            '</div></aside>' +
        '</section>';

      document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => openAction(button.dataset.action));
      });
      document.getElementById("copyLink").addEventListener("click", async () => {
        await navigator.clipboard?.writeText(affiliateLink).catch(() => {});
        notify("Seu link de afiliado foi copiado.");
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
      setWorkPanel(
        '<div class="panel-head"><h2>Novo saque</h2><span class="muted">PIX</span></div>' +
        '<form class="work" id="withdrawForm">' +
          '<div class="form-grid">' +
            '<div class="field"><label>Valor em reais</label><input class="input" name="amount" inputmode="decimal" placeholder="Ex.: 10.50" required></div>' +
            '<div class="field"><label>Modo da taxa</label><select class="select" name="feeMode"><option value="add_fee">Valor + taxa</option><option value="discount_fee">Descontar taxa</option></select></div>' +
          '</div>' +
          '<div class="field"><label>Chave PIX</label><input class="input" name="pixKey" placeholder="CPF, e-mail, telefone ou chave aleatoria" required></div>' +
          termsField +
          '<button class="submit" type="submit">Solicitar saque</button>' +
          '<div id="operationResult"></div>' +
        '</form>'
      );
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
              acceptTerms: form.get("acceptTerms") === "on"
            })
          });
          resultBox.innerHTML =
            '<div class="result">' +
              '<strong>Saque solicitado</strong>' +
              '<span class="muted">Status: ' + escapeHtml(withdraw.statusLabel) + '</span>' +
              '<span>Valor enviado: ' + money.format(withdraw.amount) + '</span>' +
              '<span>Taxa: ' + money.format(withdraw.feeAmount) + '</span>' +
              '<span>Débito total: ' + money.format(withdraw.totalDebit) + '</span>' +
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

export function registerMiniAppRoutes(app: Express): void {
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
    const summary = terrorPayService.getSummary(user.id);
    const deposits = repositories.listDeposits(user.id, 5).map((item) => ({
      ...item,
      statusLabel: depositStatusLabel(item.status),
    }));
    const withdraws = repositories.listWithdraws(user.id, 5).map((item) => ({
      ...item,
      statusLabel: withdrawStatusLabel(item.status),
    }));
    const affiliate = repositories.getAffiliateSummary(user.id);

    res.json({
      ok: true,
      verified: resolved.verified,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
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
      affiliate: {
        ...affiliate,
        percent: repositories.getAffiliateCommissionPercent(),
        enabled: repositories.getAffiliatesEnabled() && !user.affiliateBlocked,
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
      const deposit = await terrorPayService.createDeposit(resolved.user, amount);
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
    } catch (error) {
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
        repositories.acceptTerms(resolved.user.id);
      }
      const user = repositories.getUserById(resolved.user.id) ?? resolved.user;
      const pixKeyType = detectPixKeyType(pixKey);
      const withdraw = await terrorPayService.requestWithdraw(
        user,
        amount,
        pixKey,
        pixKeyType,
        feeMode,
      );
      res.json({
        ok: true,
        ...withdraw,
        pixKeyType,
        statusLabel: withdrawStatusLabel(withdraw.status),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao solicitar saque.",
      });
    }
  });
}
