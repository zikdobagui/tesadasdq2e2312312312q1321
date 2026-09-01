import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { appConfig } from "./config";

const databaseDir = path.dirname(appConfig.DATABASE_PATH);
fs.mkdirSync(databaseDir, { recursive: true });

export const db = new Database(appConfig.DATABASE_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId INTEGER NOT NULL UNIQUE,
    username TEXT,
    fullName TEXT,
    document TEXT,
    role TEXT NOT NULL DEFAULT 'client',
    feePercent REAL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    externalId TEXT NOT NULL UNIQUE,
    providerTransactionId TEXT,
    amount REAL NOT NULL,
    feePercent REAL NOT NULL,
    feeAmount REAL NOT NULL,
    netAmount REAL NOT NULL,
    payerName TEXT NOT NULL,
    payerDocument TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    qrCodeBase64 TEXT,
    qrCodeUrl TEXT,
    copyPaste TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdraw_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    externalId TEXT NOT NULL UNIQUE,
    providerTransactionId TEXT,
    amount REAL NOT NULL,
    feePercent REAL NOT NULL,
    feeAmount REAL NOT NULL,
    totalDebit REAL NOT NULL,
    pixKey TEXT NOT NULL,
    pixKeyType TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    approvedAt TEXT,
    approvedByUserId INTEGER,
    rejectedAt TEXT,
    rejectedByUserId INTEGER,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS profit_withdraw_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    externalId TEXT NOT NULL UNIQUE,
    providerTransactionId TEXT,
    amount REAL NOT NULL,
    pixKey TEXT NOT NULL,
    pixKeyType TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    referenceType TEXT,
    referenceId INTEGER,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    context TEXT NOT NULL,
    message TEXT NOT NULL,
    payloadJson TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_pix_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    pixKey TEXT NOT NULL,
    pixKeyType TEXT NOT NULL,
    alias TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affiliateUserId INTEGER NOT NULL,
    referredUserId INTEGER NOT NULL,
    depositId INTEGER NOT NULL UNIQUE,
    baseFeeAmount REAL NOT NULL,
    percent REAL NOT NULL,
    commissionAmount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREDITADO',
    createdAt TEXT NOT NULL,
    FOREIGN KEY(affiliateUserId) REFERENCES users(id),
    FOREIGN KEY(referredUserId) REFERENCES users(id),
    FOREIGN KEY(depositId) REFERENCES deposit_requests(id)
  );
`);

for (const statement of [
  "ALTER TABLE users ADD COLUMN isBlocked INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN balanceBlocked INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN referredByUserId INTEGER",
  "ALTER TABLE users ADD COLUMN affiliateBlocked INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN termsAcceptedAt TEXT",
  "ALTER TABLE withdraw_requests ADD COLUMN approvedAt TEXT",
  "ALTER TABLE withdraw_requests ADD COLUMN approvedByUserId INTEGER",
  "ALTER TABLE withdraw_requests ADD COLUMN rejectedAt TEXT",
  "ALTER TABLE withdraw_requests ADD COLUMN rejectedByUserId INTEGER",
]) {
  try {
    db.exec(statement);
  } catch {
    // Coluna já existe.
  }
}

db.prepare(`
  INSERT INTO settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO NOTHING
`).run("globalFeePercent", String(appConfig.DEFAULT_FEE_PERCENT));

const defaultSettings = [
  ["globalFeeMode", "percent"],
  ["globalFeeFixed", "0"],
  ["requireChannelJoin", "false"],
  ["requiredChannelId", ""],
  ["requiredChannelUrl", ""],
  ["referenceAnnouncementsEnabled", "false"],
  ["referenceChatId", ""],
  ["referenceCallToAction", "Venha para nosso time! Receba facil. Cresca rapido."],
  ["fakeAnnouncementsEnabled", "false"],
  ["fakeAnnouncementsMinValue", "10"],
  ["fakeAnnouncementsMaxValue", "500"],
  ["fakeAnnouncementsMinInterval", "60"],
  ["fakeAnnouncementsMaxInterval", "300"],
  ["adminUsername", ""],
  ["misticPayClientId", ""],
  ["misticPayClientSecret", ""],
  ["manualWithdrawApprovalThreshold", "250"],
  ["affiliatesEnabled", "true"],
  ["affiliateCommissionPercent", "20"],
] as const;

for (const [key, value] of defaultSettings) {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `).run(key, value);
}
