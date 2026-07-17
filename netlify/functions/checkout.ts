import type { Handler } from "@netlify/functions";
import {
  authenticate,
  createCheckoutPreference,
  emptyResponse,
  handleApiError,
  jsonResponse,
  parseBody
} from "./utils.js";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return emptyResponse(event);

  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(event, 405, { error: { code: "method-not-allowed", message: "Method not allowed" } });
    }

    const auth = await authenticate(event, true);
    const data = parseBody(event);
    const result = await createCheckoutPreference({ event, data, auth });
    return jsonResponse(event, 200, { data: result });
  } catch (error) {
    return handleApiError(event, error);
  }
};
