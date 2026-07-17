import type { Handler } from "@netlify/functions";
import {
  emptyResponse,
  handleApiError,
  jsonResponse,
  processMercadoPagoWebhook
} from "./utils.js";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return emptyResponse(event);

  try {
    const result = await processMercadoPagoWebhook(event);
    return jsonResponse(event, 200, result);
  } catch (error) {
    return handleApiError(event, error);
  }
};
