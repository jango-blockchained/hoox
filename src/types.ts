export interface WebhookData {
  apiKey?: string;
  signal?: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
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
