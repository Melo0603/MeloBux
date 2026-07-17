import type { Handler } from "@netlify/functions";
import {
  authenticate,
  closeConversation,
  createOrderReview,
  deleteAdminDocument,
  duplicateAdminDocument,
  emptyResponse,
  ensureInitialCatalog,
  grantInitialAdmin,
  handleApiError,
  jsonResponse,
  markChatRead,
  markNotificationRead,
  openSupportConversation,
  parseBody,
  registerFcmToken,
  saveAdminDocument,
  seedDefaultCatalog,
  sendChatMessage,
  setChatTyping,
  syncUserProfile,
  trackProductView,
  updateOrderStatus,
  updateUserProfile,
  type ApiRequest
} from "./utils.js";

const actions: Record<string, (request: ApiRequest) => Promise<unknown>> = {
  closeConversation,
  createOrderReview,
  deleteAdminDocument,
  duplicateAdminDocument,
  grantInitialAdmin,
  markChatRead,
  markNotificationRead,
  openSupportConversation,
  registerFcmToken,
  saveAdminDocument,
  seedDefaultCatalog,
  sendChatMessage,
  setChatTyping,
  syncUserProfile,
  trackProductView,
  updateOrderStatus,
  updateUserProfile
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

    if (action === "ensureInitialCatalog") {
      const result = await ensureInitialCatalog();
      return jsonResponse(event, 200, { data: result });
    }

    const runAction = actions[action];
    if (!runAction) {
      return jsonResponse(event, 400, { error: { code: "invalid-argument", message: "Acao invalida." } });
    }

    const auth = await authenticate(event, action === "trackProductView" ? false : true);
    const result = await runAction({ event, data, auth });
    return jsonResponse(event, 200, { data: result });
  } catch (error) {
    return handleApiError(event, error);
  }
};
