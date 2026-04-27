import type { StandardResponse } from "./types.ts";

export function createJsonResponse(
  body: StandardResponse,
  status: number = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createSuccessResponse(result?: unknown): Response {
  return createJsonResponse({ success: true, result }, 200);
}

export function createErrorResponse(
  error: string,
  status: number = 500
): Response {
  return createJsonResponse({ success: false, error }, status);
}
