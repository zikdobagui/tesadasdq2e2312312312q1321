# TerrorPay Bot

Base inicial de um bot Telegram white-label para a `TerrorPay`, usando a `MisticPay` apenas como intermediadora de PIX e saque.

## O que esta versao entrega

- Bot do Telegram com menu do cliente:
  - saldo
  - saque via PIX
  - pix para receber
- Painel admin dentro do proprio bot:
  - listar usuarios
  - ver logs recentes
  - definir taxa global
  - definir taxa especifica por usuario
- Banco local `SQLite`
- Webhook da MisticPay para confirmar depositos e atualizar saques
- Camada interna `TerrorPay`, sem mostrar `MisticPay` para o cliente final

## Stack

- Node.js
- TypeScript
- Express
- Grammy
- better-sqlite3

## Configuracao

1. Copie `.env.example` para `.env`
2. Em `discloud.config`, troque `ID=terrorpay` pelo ID/subdominio do app na Discloud.
   - Ex.: `ID=meubot`
   - O bot monta automaticamente `BASE_URL=https://meubot.discloud.app` quando `BASE_URL` nao estiver definido no `.env`.
3. Preencha:
   - `BOT_TOKEN`
   - `ADMIN_IDS`
   - `MISTICPAY_CLIENT_ID`
   - `MISTICPAY_CLIENT_SECRET`
   - `BASE_URL` apenas se quiser sobrescrever a URL automatica do `discloud.config`
4. Rode:

```bash
npm install
npm run dev
```

## Fluxo do usuario

- `/start`
- o bot usa o `username` do Telegram como identificacao interna
- depois mostra menu com:
  - `Saldo`
  - `Saque`
  - `Pix para receber`

## Fluxo do admin

- Adicione o Telegram ID em `ADMIN_IDS`
- use `/admin`

## Observacoes importantes

- O saldo do cliente e interno da `TerrorPay`, controlado por extrato local
- Toda movimentacao e registrada pelo `userId` interno, mas as integracoes externas podem usar `telegramId`
- Depositos so entram no saldo apos webhook `COMPLETO`
- Saques debitam saldo interno e, se falharem no webhook, recebem estorno automatico
- Documentacao usada da MisticPay:
  - https://docs.misticpay.com/

## API de integracao

Endpoints publicos:

```bash
GET /create_payment?user_id=7362058155&valor=10.50
GET /verify_payment?payment_id=terrorpay-deposit-1-1234567890-abcd1234
```

Formato:

- `user_id`: ID do usuario no Telegram
- `valor`: valor do pagamento
- `payment_id`: identificador retornado na criacao

## Proximos passos recomendados

- adicionar aprovacao manual de saque
- adicionar notificacao automatica ao usuario quando o webhook mudar status
- migrar para Postgres em producao
- adicionar bloqueio de usuario, KYC e mais controles no painel admin
