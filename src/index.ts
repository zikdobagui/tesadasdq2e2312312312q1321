import { bot, startFakeAnnouncements } from "./bot";
import "./db";
import { createServer } from "./server";
import { repositories } from "./repositories";
import { terrorPayService } from "./services/terrorPayService";

async function bootstrap() {
  console.log("Iniciando servidor HTTP...");
  createServer();
  const repairedCredits = repositories.repairCompletedDepositCredits();
  if (repairedCredits > 0) {
    console.log(`Creditos de deposito reparados no ledger: ${repairedCredits}`);
  }
  const repairedWithdraws = repositories.refundWithdrawsWithInvalidProviderId();
  if (repairedWithdraws > 0) {
    console.log(`Saques pendentes invalidos estornados: ${repairedWithdraws}`);
  }
  console.log("Retomando transacoes pendentes...");
  await terrorPayService.reconcilePendingTransactions().catch((error) => {
    console.error("Falha ao retomar transacoes pendentes:", error);
  });
  console.log("Iniciando bot Telegram...");
  try {
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} conectado com sucesso!`);
      },
    });
    console.log("Bot TerrorPay iniciado.");
    
    // inicia anúncios automáticos se estiver ativado
    if (repositories.getFakeAnnouncementsEnabled()) {
      console.log("Iniciando sistema de anúncios automáticos...");
      startFakeAnnouncements();
    }
  } catch (error) {
    console.error("Erro ao iniciar bot:", error);
    throw error;
  }
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar TerrorPay:", error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
