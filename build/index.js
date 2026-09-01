"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("./bot");
require("./db");
const server_1 = require("./server");
const repositories_1 = require("./repositories");
const terrorPayService_1 = require("./services/terrorPayService");
async function bootstrap() {
    console.log("Iniciando servidor HTTP...");
    (0, server_1.createServer)();
    const repairedCredits = repositories_1.repositories.repairCompletedDepositCredits();
    if (repairedCredits > 0) {
        console.log(`Creditos de deposito reparados no ledger: ${repairedCredits}`);
    }
    const repairedWithdraws = repositories_1.repositories.refundWithdrawsWithInvalidProviderId();
    if (repairedWithdraws > 0) {
        console.log(`Saques pendentes invalidos estornados: ${repairedWithdraws}`);
    }
    console.log("Retomando transacoes pendentes...");
    await terrorPayService_1.terrorPayService.reconcilePendingTransactions().catch((error) => {
        console.error("Falha ao retomar transacoes pendentes:", error);
    });
    console.log("Iniciando bot Telegram...");
    try {
        await bot_1.bot.start({
            onStart: (botInfo) => {
                console.log(`Bot @${botInfo.username} conectado com sucesso!`);
            },
        });
        console.log("Bot TerrorPay iniciado.");
        // inicia anúncios automáticos se estiver ativado
        if (repositories_1.repositories.getFakeAnnouncementsEnabled()) {
            console.log("Iniciando sistema de anúncios automáticos...");
            (0, bot_1.startFakeAnnouncements)();
        }
    }
    catch (error) {
        console.error("Erro ao iniciar bot:", error);
        throw error;
    }
}
bootstrap().catch((error) => {
    console.error("Falha ao iniciar TerrorPay:", error);
    console.error("Stack:", error.stack);
    process.exit(1);
});
