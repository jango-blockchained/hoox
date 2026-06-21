export interface WebhookData {
  apiKey?: string;
  signal?: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
  probe?: boolean;
  probe_id?: string;
  notify?: {
    message?: string;
    chatId: string;
  };
}

export interface TradeData {
  requestId: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
  probe?: boolean;
  probe_id?: string;
}

export interface NotificationData {
  requestId: string;
  message: string;
  chatId: string;
}

export type QueueMode =
  | "queue_everywhere"
  | "queue_failover"
  | "queue_disabled";

export interface ServiceResponse {
  success: boolean;
  requestId?: string;
  tradeResult?: unknown;
  notificationResult?: unknown;
  error?: string;
}
