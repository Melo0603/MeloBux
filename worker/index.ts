import {
  authenticate,
  closeConversation,
  createCheckoutPreference,
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
  processMercadoPagoWebhook,
  registerFcmToken,
  requestAuthCode,
  resetPasswordWithCode,
  saveAdminDocument,
  seedDefaultCatalog,
  sendChatMessage,
  setChatTyping,
  syncUserProfile,
  trackProductView,
  updateOrderStatus,
  updateUserProfile,
  verifyAuthCode,
  withRuntimeEnv,
  type ApiEvent,
  type ApiRequest,
  type ApiResponse,
  type WorkerEnv
} from "./utils";

const adminActions: Record<string, (request: ApiRequest) => Promise<unknown>> = {
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

const authActions: Record<string, (request: ApiRequest) => Promise<unknown>> = {
  requestAuthCode,
  resetPasswordWithCode,
  verifyAuthCode
};

function headersToRecord(headers: Headers) {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function searchParamsToRecord(searchParams: URLSearchParams) {
  const output: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

async function createApiEvent(request: Request, env: WorkerEnv): Promise<ApiEvent> {
  const url = new URL(request.url);
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();

  return {
    httpMethod: request.method,
    headers: headersToRecord(request.headers),
    queryStringParameters: searchParamsToRecord(url.searchParams),
    body,
    isBase64Encoded: false,
    request,
    env
  };
}

function toResponse(response: ApiResponse) {
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers
  });
}

async function handleCheckout(event: ApiEvent) {
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
}

async function handleAdmin(event: ApiEvent) {
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

    const runAction = adminActions[action];
    if (!runAction) {
      return jsonResponse(event, 400, { error: { code: "invalid-argument", message: "Acao invalida." } });
    }

    const auth = await authenticate(event, action === "trackProductView" ? false : true);
    const result = await runAction({ event, data, auth });
    return jsonResponse(event, 200, { data: result });
  } catch (error) {
    return handleApiError(event, error);
  }
}

async function handleAuth(event: ApiEvent) {
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

    const runAction = authActions[action];
    if (!runAction) {
      return jsonResponse(event, 400, { error: { code: "invalid-argument", message: "Acao invalida." } });
    }

    const result = await runAction({ event, data });
    return jsonResponse(event, 200, { data: result });
  } catch (error) {
    return handleApiError(event, error);
  }
}

async function handleWebhook(event: ApiEvent) {
  if (event.httpMethod === "OPTIONS") return emptyResponse(event);

  console.log("[MercadoPago webhook] HTTP method received", event.httpMethod);
  console.log("[MercadoPago webhook] Query params", event.queryStringParameters);
  console.log("[MercadoPago webhook] Relevant headers", {
    "x-signature": event.headers["x-signature"] ?? null,
    "x-request-id": event.headers["x-request-id"] ?? null,
    "user-agent": event.headers["user-agent"] ?? null
  });
  console.log("[MercadoPago webhook] Raw body", event.body);

  try {
    const result = await processMercadoPagoWebhook(event);
    console.log("[MercadoPago webhook] Handler result", result);
    return jsonResponse(event, 200, result);
  } catch (error) {
    console.error("[MercadoPago webhook] Handler error", error instanceof Error ? error.stack || error : error);
    return handleApiError(event, error);
  }
}

async function routeApiRequest(request: Request, env: WorkerEnv) {
  const event = await createApiEvent(request, env);
  const { pathname } = new URL(request.url);
  const normalizedPath = pathname.replace(/\/$/, "");

  if (normalizedPath === "/api/checkout") return handleCheckout(event);
  if (normalizedPath === "/api/admin") return handleAdmin(event);
  if (normalizedPath === "/api/auth") return handleAuth(event);
  if (normalizedPath === "/api/webhook" || normalizedPath === "/api/webhook/mercadopago") {
    return handleWebhook(event);
  }

  return jsonResponse(event, 404, { error: { code: "not-found", message: "Endpoint nao encontrado." } });
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    return withRuntimeEnv(env, async () => {
      const { pathname } = new URL(request.url);
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        const response = await routeApiRequest(request, env);
        return toResponse(response);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Not found", { status: 404 });
    });
  }
};
