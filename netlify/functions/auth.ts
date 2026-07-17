import type { Handler } from "@netlify/functions";
import {
  emptyResponse,
  handleApiError,
  jsonResponse,
  parseBody,
  requestAuthCode,
  resetPasswordWithCode,
  verifyAuthCode,
  type ApiRequest
} from "./utils.js";

const actions: Record<string, (request: ApiRequest) => Promise<unknown>> = {
  requestAuthCode,
  resetPasswordWithCode,
  verifyAuthCode
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return emptyResponse(event);

  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(event, 405, { error: { code: "method-not-allowed", message: "Method not allowed" } });
    }

    const body = parseBody(event);
    const action = typeof body.action === "string" ? body.action : "";
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

    const runAction = actions[action];
    if (!runAction) {
      return jsonResponse(event, 400, { error: { code: "invalid-argument", message: "Acao invalida." } });
    }

    const result = await runAction({ event, data });
    return jsonResponse(event, 200, { data: result });
  } catch (error) {
    return handleApiError(event, error);
  }
};
