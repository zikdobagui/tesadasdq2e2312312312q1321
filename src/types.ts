export type UserRole = "admin" | "client";

export type PixKeyType =
  | "CPF"
  | "CNPJ"
  | "EMAIL"
  | "TELEFONE"
  | "CHAVE_ALEATORIA";

export type WithdrawFeeMode = "add_fee" | "discount_fee";

export interface UserRecord {
  id: number;
  telegramId: number;
  username: string | null;
  fullName: string | null;
  document: string | null;
  role: UserRole;
  feePercent: number | null;
  isBlocked: boolean;
  balanceBlocked: boolean;
  referredByUserId: number | null;
  affiliateBlocked: boolean;
  termsAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}



export interface BotSession {
  flow:
    | { name: "idle" }
    | { name: "deposit_amount" }
    | { name: "withdraw_amount" }
    | { name: "withdraw_mode" }
    | { name: "withdraw_key" }
    | { name: "extract_search_payment_id" }
    | { name: "admin_global_fee" }
    | { name: "admin_withdraw_approval_threshold" }
    | { name: "admin_user_fee" }
    | { name: "admin_affiliate_percent" }
    | { name: "admin_misticpay_client_id" }
    | { name: "admin_misticpay_client_secret" }
    | { name: "admin_required_channel_id" }
    | { name: "admin_required_channel_url" }
    | { name: "admin_reference_chat_id" }
    | { name: "admin_reference_cta" }
    | { name: "admin_profit_withdraw_key" }
    | { name: "admin_bot_username" }
    | { name: "withdraw_save_key_alias" }
    | { name: "admin_fake_announcement_amount" }
    | { name: "admin_set_admin_username" }
    | { name: "admin_broadcast_message" }
    | { name: "admin_user_lookup" }
    | { name: "admin_user_balance_adjust"; targetUserId: number }
    | { name: "withdraw_save_key_alias" };
  pendingWithdraw?: {
    amount: number;
    pixKey: string;
    pixKeyType?: PixKeyType;
    feeMode?: WithdrawFeeMode;
  };
  pendingPixKeySave?: {
    pixKey: string;
    pixKeyType: PixKeyType;
  };
  lastBotMessageId?: number;
  extractPage?: number;
  extractSection?: "deposits" | "withdraws";
  extractStatus?: "ALL" | "COMPLETO" | "PENDENTE" | "QUEUED" | "FALHA" | "CANCELADO";
  extractPeriodDays?: 1 | 7 | 30 | 0;
  extractSearchId?: string;
}
