import type { Fetcher } from "@cloudflare/workers-types";

export interface TradeData {
  requestId: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
}

export interface ServiceResponse {
  success: boolean;
  requestId: string;
  result?: unknown;
  error?: string;
}

export async function processTrade(
  tradeData: TradeData,
  tradeService: Fetcher | undefined
): Promise<ServiceResponse> {
  const { requestId, exchange, action, symbol, quantity, price, leverage } = tradeData;

  if (!tradeService) {
    return { success: false, requestId, error: "Trade service binding not available." };
  }

  try {
    const tradeWorkerPayload = {
      exchange,
      action: action.toUpperCase(),
      symbol,
      quantity,
      price,
      leverage,
    };

    const response = await tradeService.fetch("http://trade-service/webhook", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify(tradeWorkerPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        requestId,
        error: `Trade service call failed: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    return { success: true, requestId, result };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error");
    return { success: false, requestId, error: `Exception: ${errorMsg}` };
  }
}