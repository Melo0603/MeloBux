import type { Handler } from "@netlify/functions";
import {
  emptyResponse,
  handleApiError,
  jsonResponse,
  processMercadoPagoWebhook
} from "./utils.js";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return emptyResponse(event);

  console.log("[MercadoPago webhook] HTTP method received", event.httpMethod);
  console.log("[MercadoPago webhook] Query params", event.queryStringParameters);
  console.log("[MercadoPago webhook] Relevant headers", {
    "x-signature": event.headers["x-signature"] ?? event.headers["X-Signature"] ?? null,
    "x-request-id": event.headers["x-request-id"] ?? event.headers["X-Request-Id"] ?? null,
    "user-agent": event.headers["user-agent"] ?? event.headers["User-Agent"] ?? null
  });
  console.log("[MercadoPago webhook] Raw body", event.body);

  try {
    const result = await processMercadoPagoWebhook(event);
    console.log("[MercadoPago webhook] Handler result", result);
    return jsonResponse(event, 200, result);
  } catch (error) {
    console.error(
      "[MercadoPago webhook] Handler error",
      error instanceof Error ? error.stack || error : error
    );
    return handleApiError(event, error);
  }
};
