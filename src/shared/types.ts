export interface StandardResponse {
  success: boolean;
  result?: unknown;
  error?: string | null;
  message?: string;
  tradeResult?: unknown;
  notificationResult?: unknown;
}

export interface WebhookPayload {
  exchange: string;
  action: "LONG" | "SHORT" | "CLOSE_LONG" | "CLOSE_SHORT";
  symbol: string;
  quantity: number;
  price?: number;
  orderType?: string;
  leverage?: number;
}

export type TradeAction = "LONG" | "SHORT" | "CLOSE_LONG" | "CLOSE_SHORT";

export interface TradeSignal {
  id?: number;
  source: string;
  symbol: string;
  action: TradeAction;
  price?: number;
  quantity: number;
  leverage?: number;
  status?: "pending" | "executed" | "failed" | "skipped";
  createdAt?: string;
  executedAt?: string;
  error?: string;
}
