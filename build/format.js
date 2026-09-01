"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCurrency = formatCurrency;
exports.formatDate = formatDate;
exports.normalizeDocument = normalizeDocument;
exports.parseMoneyInput = parseMoneyInput;
function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value));
}
function normalizeDocument(value) {
    return value.replace(/\D/g, "");
}
function parseMoneyInput(value) {
    const normalized = value.replace(/[^\d,.-]/g, "").replace(",", ".");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    return Math.round(amount * 100) / 100;
}
