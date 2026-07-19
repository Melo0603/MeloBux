import {
  fallbackBanners,
  fallbackCategories,
  fallbackCoupons,
  fallbackFaqs,
  fallbackPopups,
  fallbackProducts,
  fallbackReviews,
  fallbackSettings
} from "../src/data/defaultContent.js";
import {
  FieldValue,
  Timestamp,
  auth,
  constantTimeEqual,
  db,
  decodeBase64Utf8,
  firebasePrivateKeyValue,
  hmacSha256Hex,
  messaging,
  randomSixDigitCode,
  setFirebaseRuntimeEnv,
  sha256Hex,
  type DecodedIdToken
} from "./firebaseRest";

export type WorkerEnv = Record<string, string | undefined> & {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
};

export type ApiEvent = {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
  request: Request;
  env: WorkerEnv;
};

export type ApiResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

type AdminCollection =
  | "banners"
  | "categories"
  | "products"
  | "coupons"
  | "faqs"
  | "settings"
  | "popups";

type AuthContext = {
  uid: string;
  token: DecodedIdToken;
};

export type ApiRequest = {
  event: ApiEvent;
  data: Record<string, unknown>;
  auth?: AuthContext;
};

let activeEnv: WorkerEnv = {};

export async function withRuntimeEnv<T>(env: WorkerEnv, callback: () => Promise<T>) {
  const previousEnv = activeEnv;
  activeEnv = env;
  setFirebaseRuntimeEnv(env);
  try {
    return await callback();
  } finally {
    activeEnv = previousEnv;
    setFirebaseRuntimeEnv(previousEnv);
  }
}

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const adminCollections = new Set<AdminCollection>([
  "banners",
  "categories",
  "products",
  "coupons",
  "faqs",
  "settings",
  "popups"
]);

const allowedAdminEmail = "carlosmelo0603n2@gmail.com";
const privilegedRoles = new Set(["admin", "staff"]);

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isAllowedAdminEmail(value: unknown) {
  return normalizeEmail(value) === allowedAdminEmail;
}

function normalizeRole(value: unknown) {
  return value === "admin" || value === "staff" || value === "customer" ? value : "customer";
}

const orderStatuses = new Set([
  "pending_payment",
  "payment_pending",
  "paid",
  "processing",
  "delivering",
  "delivered",
  "cancelled",
  "payment_rejected"
]);

function envValue(name: string) {
  return activeEnv[name] || (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[name];
}

function requiredEnv(name: string) {
  const value = envValue(name);
  if (!value) throw new ApiError(500, "failed-precondition", `${name} nao configurado.`);
  return value;
}

function firebasePrivateKey() {
  return firebasePrivateKeyValue();
}

function allowedOrigins() {
  return [
    "http://localhost:5173",
    "http://localhost:8888",
    "https://melobux.web.app",
    "https://melobux.firebaseapp.com",
    envValue("PUBLIC_SITE_URL"),
    envValue("WORKER_PUBLIC_URL"),
    ...(envValue("ALLOWED_ORIGINS")?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [])
  ].filter(Boolean) as string[];
}

export function corsHeaders(event: ApiEvent) {
  const origin = event.headers.origin ?? event.headers.Origin ?? "";
  const allowed = allowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function jsonResponse(event: ApiEvent, statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders(event),
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

export function emptyResponse(event: ApiEvent): ApiResponse {
  return {
    statusCode: 204,
    headers: corsHeaders(event),
    body: ""
  };
}

export function handleApiError(event: ApiEvent, error: unknown): ApiResponse {
  if (error instanceof ApiError) {
    return jsonResponse(event, error.statusCode, {
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  console.error("Worker request failed", {
    message: typeof record.message === "string" ? record.message : String(error),
    code: record.code ?? null,
    stack: typeof record.stack === "string" ? record.stack : null,
    cause: record.cause ?? null,
    response: record.response ?? null
  });

  return jsonResponse(event, 500, {
    error: {
      code: "internal",
      message: "Erro interno no servidor."
    }
  });
}

export function parseBody(event: ApiEvent) {
  if (!event.body) return {};

  try {
    const raw = event.isBase64Encoded
      ? decodeBase64Utf8(event.body)
      : event.body;
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    throw new ApiError(400, "invalid-argument", "JSON invalido.");
  }
}

export async function authenticate(event: ApiEvent, required = true): Promise<AuthContext | undefined> {
  const header = event.headers.authorization ?? event.headers.Authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    if (required) throw new ApiError(401, "unauthenticated", "Faca login para continuar.");
    return undefined;
  }

  try {
    const token = await auth.verifyIdToken(match[1]);
    return { uid: token.uid, token };
  } catch {
    if (required) throw new ApiError(401, "unauthenticated", "Sessao invalida.");
    return undefined;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid-argument", "Payload invalido.");
  }

  return value as Record<string, unknown>;
}

async function ensureUserDocument(requestAuth: AuthContext) {
  const email = normalizeEmail(requestAuth.token.email);
  const user = await auth.getUser(requestAuth.uid).catch(() => null);
  const userRef = db.doc(`users/${requestAuth.uid}`);
  const snapshot = await userRef.get();
  const existing = snapshot.data() ?? {};
  const role = isAllowedAdminEmail(email) ? "admin" : normalizeRole(existing.role);

  await userRef.set(
    {
      displayName:
        user?.displayName ||
        (typeof existing.displayName === "string" && existing.displayName ? existing.displayName : email.split("@")[0] || "Cliente"),
      email: email || user?.email || null,
      photoURL: user?.photoURL || existing.photoURL || existing.photoUrl || "",
      photoUrl: user?.photoURL || existing.photoUrl || existing.photoURL || "",
      role,
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return role;
}

async function assertStaffOrAdmin(requestAuth: AuthContext | undefined) {
  if (!requestAuth) {
    throw new ApiError(401, "unauthenticated", "Faca login para continuar.");
  }

  const role = await ensureUserDocument(requestAuth);
  if (!privilegedRoles.has(role)) {
    throw new ApiError(403, "permission-denied", "Usuario sem permissao administrativa.");
  }

  return role;
}

function sanitizeId(id: unknown) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{2,80}$/.test(id)) {
    throw new ApiError(400, "invalid-argument", "ID invalido.");
  }

  return id;
}

function sanitizeCollection(collection: unknown): AdminCollection {
  if (typeof collection !== "string" || !adminCollections.has(collection as AdminCollection)) {
    throw new ApiError(400, "invalid-argument", "Colecao nao permitida.");
  }

  return collection as AdminCollection;
}

function clientIp(event: ApiEvent) {
  const forwarded = event.headers["x-forwarded-for"] ?? event.headers["X-Forwarded-For"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return event.headers["cf-connecting-ip"] ?? event.headers["client-ip"] ?? null;
}

function sanitizeText(value: unknown, maxLength = 240, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid-argument", "Texto invalido.");
  }

  return value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeLongText(value: unknown, maxLength = 4000) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid-argument", "Texto invalido.");
  }

  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function sanitizeUrl(value: unknown, allowRelative = false) {
  const url = sanitizeText(value, 600);
  if (!url) return "";

  if (allowRelative && url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw new ApiError(400, "invalid-argument", "URL invalida.");
  }
}

function sanitizeNumber(value: unknown, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new ApiError(400, "invalid-argument", "Numero invalido.");
  }

  const next = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && next < options.min) {
    throw new ApiError(400, "invalid-argument", "Numero abaixo do minimo.");
  }
  if (options.max !== undefined && next > options.max) {
    throw new ApiError(400, "invalid-argument", "Numero acima do maximo.");
  }
  return next;
}

function sanitizeStringArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, 160))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanDocumentData(data: unknown) {
  const input = asRecord(data);
  const blocked = new Set(["createdAt", "updatedAt", "deletedAt", "adminOnly"]);
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (blocked.has(key)) continue;
    if (value === undefined) continue;
    output[key] = value;
  }

  return output;
}

function parseMoney(value: unknown) {
  const numberValue = typeof value === "string" ? Number(value) : value;

  if (typeof numberValue !== "number" || !Number.isFinite(numberValue) || numberValue <= 0) {
    throw new ApiError(400, "invalid-argument", "Preco invalido.");
  }

  return Math.round(numberValue * 100) / 100;
}

function validateAdminData(collection: AdminCollection, data: Record<string, unknown>) {
  if (collection === "products") {
    return {
      id: sanitizeText(data.id, 80),
      categorySlug: sanitizeText(data.categorySlug, 80),
      name: sanitizeText(data.name, 140),
      quantity: sanitizeNumber(data.quantity, { min: 1, integer: true }),
      price: parseMoney(data.price),
      stock: sanitizeNumber(data.stock, { min: 0, integer: true }),
      status: sanitizeText(data.status, 24) || "draft",
      sortOrder: sanitizeNumber(data.sortOrder ?? 999, { min: 0, integer: true }),
      description: sanitizeLongText(data.description),
      deliveryTime: sanitizeText(data.deliveryTime, 160),
      guarantees: sanitizeStringArray(data.guarantees),
      paymentMethods: sanitizeStringArray(data.paymentMethods),
      faqIds: sanitizeStringArray(data.faqIds),
      imageUrl: sanitizeUrl(data.imageUrl, true),
      gallery: Array.isArray(data.gallery)
        ? data.gallery.map((item) => sanitizeUrl(item, true)).filter(Boolean).slice(0, 8)
        : [],
      soldCount: sanitizeNumber(data.soldCount ?? 0, { min: 0, integer: true }),
      visitCount: sanitizeNumber(data.visitCount ?? 0, { min: 0, integer: true })
    };
  }

  if (collection === "categories") {
    return {
      id: sanitizeText(data.id, 80),
      slug: sanitizeText(data.slug, 80),
      name: sanitizeText(data.name, 120),
      imageUrl: sanitizeUrl(data.imageUrl, true),
      bannerUrl: sanitizeUrl(data.bannerUrl, true),
      description: sanitizeLongText(data.description),
      deliveryTime: sanitizeText(data.deliveryTime, 180),
      importantInfo: sanitizeLongText(data.importantInfo, 1200),
      deliveryNotice: sanitizeLongText(data.deliveryNotice, 1200),
      ratingAverage: sanitizeNumber(data.ratingAverage ?? 5, { min: 0, max: 5 }),
      ratingCount: sanitizeNumber(data.ratingCount ?? 0, { min: 0, integer: true }),
      status: sanitizeText(data.status, 24) || "draft",
      sortOrder: sanitizeNumber(data.sortOrder ?? 999, { min: 0, integer: true }),
      chatUrl: sanitizeUrl(data.chatUrl, true)
    };
  }

  if (collection === "coupons") {
    return {
      id: sanitizeText(data.id, 80).toUpperCase(),
      code: sanitizeText(data.code, 40).toUpperCase(),
      type: sanitizeText(data.type, 20) === "fixed" ? "fixed" : "percent",
      value: sanitizeNumber(data.value, { min: 0 }),
      status: sanitizeText(data.status, 24) || "draft",
      expiresAt: sanitizeText(data.expiresAt, 40),
      maxUses: sanitizeNumber(data.maxUses ?? 0, { min: 0, integer: true }),
      usedCount: sanitizeNumber(data.usedCount ?? 0, { min: 0, integer: true }),
      minOrderValue: sanitizeNumber(data.minOrderValue ?? 0, { min: 0 }),
      oncePerUser: data.oncePerUser === true,
      maxUsesPerUser: sanitizeNumber(data.maxUsesPerUser ?? 1, { min: 1, integer: true }),
      description: sanitizeLongText(data.description, 400)
    };
  }

  if (collection === "faqs") {
    return {
      id: sanitizeText(data.id, 80),
      question: sanitizeText(data.question, 200),
      answer: sanitizeLongText(data.answer, 1200),
      status: sanitizeText(data.status, 24) || "draft",
      sortOrder: sanitizeNumber(data.sortOrder ?? 999, { min: 0, integer: true })
    };
  }

  if (collection === "banners") {
    return {
      id: sanitizeText(data.id, 80),
      title: sanitizeText(data.title, 160),
      imageUrl: sanitizeUrl(data.imageUrl, true),
      buttonLabel: sanitizeText(data.buttonLabel, 60),
      url: sanitizeUrl(data.url, true),
      status: sanitizeText(data.status, 24) || "draft",
      sortOrder: sanitizeNumber(data.sortOrder ?? 999, { min: 0, integer: true })
    };
  }

  if (collection === "popups") {
    return {
      id: sanitizeText(data.id, 80),
      title: sanitizeText(data.title, 160),
      body: sanitizeLongText(data.body, 800),
      imageUrl: sanitizeUrl(data.imageUrl, true),
      buttonLabel: sanitizeText(data.buttonLabel, 60),
      url: sanitizeUrl(data.url, true),
      type: sanitizeText(data.type, 40),
      status: sanitizeText(data.status, 24) || "draft",
      sortOrder: sanitizeNumber(data.sortOrder ?? 999, { min: 0, integer: true })
    };
  }

  if (collection === "settings") {
    return {
      id: "public",
      storeName: sanitizeText(data.storeName, 100),
      homeBannerImageUrl: sanitizeUrl(data.homeBannerImageUrl, true),
      ownerName: sanitizeText(data.ownerName, 80),
      ownerRobloxUsername: sanitizeText(data.ownerRobloxUsername, 40),
      ownerRobloxUserId: sanitizeText(data.ownerRobloxUserId, 40),
      ownerAvatarUrl: sanitizeUrl(data.ownerAvatarUrl, true),
      tiktokUrl: sanitizeUrl(data.tiktokUrl),
      instagramUrl: sanitizeUrl(data.instagramUrl),
      whatsappUrl: sanitizeUrl(data.whatsappUrl),
      notice: sanitizeLongText(data.notice, 500),
      policy: sanitizeLongText(data.policy, 1800),
      guarantees: sanitizeStringArray(data.guarantees),
      paymentMethods: sanitizeStringArray(data.paymentMethods)
    };
  }

  return data;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "invalid-argument", `${field} obrigatorio.`);
  }

  return value.trim();
}

function normalizeRobloxUsername(value: unknown) {
  const username = requireString(value, "Usuario Roblox");

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new ApiError(
      400,
      "invalid-argument",
      "Usuario Roblox deve ter 3 a 20 caracteres, usando letras, numeros ou underline."
    );
  }

  return username;
}

async function resolveCoupon(codeValue: unknown, price: number, uid: string) {
  const code = sanitizeText(codeValue, 40).toUpperCase();
  if (!code) {
    return { couponCode: null, discountTotal: 0 };
  }

  const couponSnapshot = await db.doc(`coupons/${code}`).get();
  if (!couponSnapshot.exists) {
    throw new ApiError(412, "failed-precondition", "Cupom nao encontrado.");
  }

  const coupon = couponSnapshot.data()!;
  if (coupon.status !== "active") {
    throw new ApiError(412, "failed-precondition", "Cupom indisponivel.");
  }

  if (typeof coupon.expiresAt === "string" && coupon.expiresAt) {
    const expiresAt = new Date(`${coupon.expiresAt}T23:59:59-03:00`).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      throw new ApiError(412, "failed-precondition", "Cupom expirado.");
    }
  }

  const maxUses = typeof coupon.maxUses === "number" ? coupon.maxUses : 0;
  const usedCount = typeof coupon.usedCount === "number" ? coupon.usedCount : 0;
  if (maxUses > 0 && usedCount >= maxUses) {
    throw new ApiError(412, "failed-precondition", "Cupom esgotado.");
  }

  const minOrderValue = typeof coupon.minOrderValue === "number" ? coupon.minOrderValue : 0;
  if (price < minOrderValue) {
    throw new ApiError(412, "failed-precondition", "Valor minimo do cupom nao atingido.");
  }

  if (coupon.oncePerUser === true) {
    const usage = await db.doc(`couponUsages/${code}_${uid}`).get();
    if (usage.exists) {
      throw new ApiError(412, "failed-precondition", "Cupom ja utilizado por este usuario.");
    }
  }

  const rawDiscount =
    coupon.type === "fixed"
      ? Number(coupon.value)
      : price * (Number(coupon.value) / 100);
  const discountTotal = Math.min(price, Math.max(0, Math.round(rawDiscount * 100) / 100));

  return { couponCode: code, discountTotal };
}

function mercadoPagoPreferenceErrorMessage(preference: Record<string, unknown>) {
  const parts = [
    typeof preference.message === "string" ? preference.message : "",
    typeof preference.error === "string" ? preference.error : ""
  ];
  const cause = preference.cause;

  if (Array.isArray(cause)) {
    for (const item of cause) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const code = typeof record.code === "string" ? record.code : "";
      const description = typeof record.description === "string" ? record.description : "";
      if (code || description) parts.push([code, description].filter(Boolean).join(": "));
    }
  }

  const detail = parts.filter(Boolean).join(" | ").slice(0, 360);
  return detail
    ? `Mercado Pago rejeitou o checkout: ${detail}`
    : "Mercado Pago rejeitou o checkout. Verifique token, URL publica e dados da preferencia.";
}

async function enforceRateLimit(uid: string, key: string, max = 30, windowMs = 60_000) {
  const ref = db.collection("rateLimits").doc(`${uid}_${key}`);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const resetAt = typeof data?.resetAt === "number" ? data.resetAt : 0;
    const count = typeof data?.count === "number" ? data.count : 0;

    if (!snapshot.exists || resetAt < now) {
      transaction.set(ref, {
        count: 1,
        resetAt: now + windowMs,
        updatedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    if (count >= max) {
      throw new ApiError(429, "resource-exhausted", "Muitas tentativas. Aguarde um pouco.");
    }

    transaction.set(
      ref,
      {
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

type AuthCodePurpose = "login" | "password_reset";

function authCodePurpose(value: unknown): AuthCodePurpose {
  return value === "password_reset" ? "password_reset" : "login";
}

function requireEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid-argument", "Informe um e-mail valido.");
  }
  return email;
}

async function authCodeDocumentId(email: string, purpose: AuthCodePurpose) {
  return sha256Hex(`${purpose}:${email}`);
}

function authCodeSecret() {
  return envValue("AUTH_CODE_SECRET") || firebasePrivateKey();
}

async function hashAuthCode(email: string, purpose: AuthCodePurpose, code: string) {
  return hmacSha256Hex(authCodeSecret(), `${purpose}:${email}:${code}`);
}

function safeCompare(value: string, expected: string) {
  return constantTimeEqual(value, expected);
}

async function sendAuthCodeEmail(email: string, code: string, purpose: AuthCodePurpose) {
  const from = envValue("EMAIL_FROM");
  const subject = purpose === "password_reset" ? "Codigo para redefinir sua senha" : "Codigo de acesso MeloBux";
  const intro =
    purpose === "password_reset"
      ? "Use este codigo para cadastrar uma nova senha na MeloBux."
      : "Use este codigo para entrar na sua conta MeloBux.";
  const text = `${intro}\n\nCodigo: ${code}\n\nEle expira em 10 minutos.`;
  const html = `<p>${intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Ele expira em 10 minutos.</p>`;
  const resendApiKey = envValue("RESEND_API_KEY");
  const emailEndpoint = envValue("EMAIL_HTTP_ENDPOINT");
  const emailBearerToken = envValue("EMAIL_HTTP_BEARER_TOKEN");

  if (resendApiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: email, subject, text, html })
    });
    if (!response.ok) {
      throw new ApiError(502, "failed-precondition", `Falha ao enviar codigo por e-mail: ${response.status}`);
    }
    return;
  }

  if (emailEndpoint && from) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (emailBearerToken) headers.Authorization = `Bearer ${emailBearerToken}`;
    const response = await fetch(emailEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ from, to: email, subject, text, html, purpose })
    });
    if (!response.ok) {
      throw new ApiError(502, "failed-precondition", `Falha ao enviar codigo por e-mail: ${response.status}`);
    }
    return;
  }

  throw new ApiError(500, "failed-precondition", "Servico de e-mail HTTP nao configurado para envio de codigos.");
}

async function verifyStoredAuthCode(email: string, purpose: AuthCodePurpose, code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, "invalid-argument", "Codigo invalido.");
  }

  const ref = db.collection("authCodes").doc(await authCodeDocumentId(email, purpose));
  const snapshot = await ref.get();
  const data = snapshot.data();

  if (!snapshot.exists || !data) {
    throw new ApiError(400, "invalid-argument", "Codigo expirado ou invalido.");
  }

  const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : 0;
  const attempts = typeof data.attempts === "number" ? data.attempts : 0;
  const expectedHash = typeof data.codeHash === "string" ? data.codeHash : "";
  const currentHash = await hashAuthCode(email, purpose, code);

  if (expiresAt < Date.now()) {
    await ref.delete();
    throw new ApiError(400, "invalid-argument", "Codigo expirado. Solicite outro.");
  }

  if (attempts >= 6) {
    await ref.delete();
    throw new ApiError(429, "resource-exhausted", "Muitas tentativas. Solicite outro codigo.");
  }

  if (!safeCompare(currentHash, expectedHash)) {
    await ref.set(
      {
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    throw new ApiError(400, "invalid-argument", "Codigo incorreto.");
  }

  await ref.delete();
}

async function getOrCreateAuthUser(email: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return auth.createUser({
      email,
      emailVerified: true,
      displayName: email.split("@")[0]
    });
  }
}

export async function requestAuthCode(request: ApiRequest) {
  const email = requireEmail(request.data.email);
  const purpose = authCodePurpose(request.data.purpose);
  await enforceRateLimit(await authCodeDocumentId(email, purpose), "auth-code", 5, 15 * 60_000);

  if (purpose === "password_reset") {
    try {
      await auth.getUserByEmail(email);
    } catch {
      return { ok: true };
    }
  }

  const code = randomSixDigitCode();
  await db.collection("authCodes").doc(await authCodeDocumentId(email, purpose)).set({
    email,
    purpose,
    codeHash: await hashAuthCode(email, purpose, code),
    attempts: 0,
    expiresAt: Date.now() + 10 * 60_000,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await sendAuthCodeEmail(email, code, purpose);

  return { ok: true };
}

export async function verifyAuthCode(request: ApiRequest) {
  const email = requireEmail(request.data.email);
  const code = requireString(request.data.code, "Codigo").trim();
  await verifyStoredAuthCode(email, "login", code);
  const user = await getOrCreateAuthUser(email);
  const customToken = await auth.createCustomToken(user.uid);
  const userRef = db.doc(`users/${user.uid}`);
  const userSnapshot = await userRef.get();
  const existingRole = normalizeRole(userSnapshot.data()?.role);

  await userRef.set(
    {
      email,
      displayName: user.displayName || email.split("@")[0],
      role: isAllowedAdminEmail(email) ? "admin" : existingRole,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(userSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
    },
    { merge: true }
  );

  return { ok: true, customToken };
}

export async function resetPasswordWithCode(request: ApiRequest) {
  const email = requireEmail(request.data.email);
  const code = requireString(request.data.code, "Codigo").trim();
  const password = requireString(request.data.password, "Nova senha");
  if (password.length < 6) {
    throw new ApiError(400, "invalid-argument", "Use uma senha com pelo menos 6 caracteres.");
  }

  await verifyStoredAuthCode(email, "password_reset", code);
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  const customToken = await auth.createCustomToken(user.uid);

  return { ok: true, customToken };
}

function audit(
  uid: string,
  action: string,
  details: Record<string, unknown>,
  meta: { email?: string | null; ip?: string | null; entity?: string; entityId?: string } = {}
) {
  return db.collection("adminAudit").add({
    uid,
    email: meta.email ?? null,
    ip: meta.ip ?? null,
    action,
    entity: meta.entity ?? null,
    entityId: meta.entityId ?? null,
    details,
    createdAt: FieldValue.serverTimestamp()
  });
}

async function createStoreNotification(options: {
  userId: string | null;
  audience: "user" | "admin";
  title: string;
  body: string;
  type: "payment" | "order" | "chat" | "coupon" | "user" | "system";
  link?: string;
}) {
  return db.collection("notifications").add({
    userId: options.userId,
    audience: options.audience,
    title: sanitizeText(options.title, 120),
    body: sanitizeLongText(options.body, 400),
    type: options.type,
    link: options.link ?? "",
    sound: true,
    read: false,
    createdAt: FieldValue.serverTimestamp()
  });
}

function publicSiteUrl() {
  return (envValue("PUBLIC_SITE_URL") || "https://melobux.web.app").replace(/\/$/, "");
}

function functionOrigin(event: ApiEvent) {
  const host = event.headers.host ?? event.headers.Host;
  const requestUrl = new URL(event.request.url);
  const proto = event.headers["x-forwarded-proto"] ?? requestUrl.protocol.replace(":", "") ?? "https";
  if (host) return `${proto}://${host}`;
  return (envValue("WORKER_PUBLIC_URL") || publicSiteUrl()).replace(/\/$/, "");
}

async function notifyUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>
) {
  const tokensSnapshot = await db.collection(`users/${userId}/fcmTokens`).get();
  const tokens = tokensSnapshot.docs.map((docSnapshot) => docSnapshot.id);

  if (tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    webpush: {
      fcmOptions: {
        link: `${publicSiteUrl()}${data.link || (data.orderId ? `/pedido/${data.orderId}` : "/")}`
      }
    }
  });
}

function getNestedString(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function getPaymentEmail(payment?: Record<string, unknown>) {
  return (
    normalizeEmail(getNestedString(payment, ["payer", "email"])) ||
    normalizeEmail(getNestedString(payment, ["metadata", "buyer_email"])) ||
    normalizeEmail(getNestedString(payment, ["additional_info", "payer", "email"]))
  );
}

async function findUserIdByEmail(email: unknown) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";
  const user = await auth.getUserByEmail(normalized).catch(() => null);
  return user?.uid ?? "";
}

async function resolveOrderUserId(
  orderId: string,
  order: Record<string, unknown>,
  payment?: Record<string, unknown>
) {
  const existingUserId = typeof order.userId === "string" ? order.userId.trim() : "";
  if (existingUserId) return existingUserId;

  const metadataUserId = getNestedString(payment, ["metadata", "user_id"]);
  if (metadataUserId) {
    const user = await auth.getUser(metadataUserId).catch(() => null);
    if (user) {
      await db.doc(`orders/${orderId}`).set(
        {
          userId: user.uid,
          buyerEmail: normalizeEmail(order.buyerEmail) || user.email || null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return user.uid;
    }
  }

  const emailCandidates = [
    order.buyerEmail,
    getPaymentEmail(payment),
    getNestedString(payment, ["metadata", "buyer_email"])
  ];

  for (const email of emailCandidates) {
    const userId = await findUserIdByEmail(email);
    if (userId) {
      await db.doc(`orders/${orderId}`).set(
        {
          userId,
          buyerEmail: normalizeEmail(email) || null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await db.doc(`users/${userId}`).set(
        {
          email: normalizeEmail(email) || null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return userId;
    }
  }

  console.error("[orders] Paid order without resolvable userId", {
    orderId,
    buyerEmail: order.buyerEmail ?? null,
    paymentEmail: getPaymentEmail(payment) || null
  });
  return "";
}

async function notifyOrderPaid(orderId: string, orderOverride?: Record<string, unknown>) {
  const orderSnapshot = await db.doc(`orders/${orderId}`).get();
  const order = orderOverride ?? orderSnapshot.data();

  if (!order) return;

  const userId = await resolveOrderUserId(orderId, order);

  await createStoreNotification({
    userId: null,
    audience: "admin",
    title: "Novo pagamento aprovado",
    body: `${order.productName ?? ""} para ${order.robloxUsername ?? ""}`,
    type: "payment",
    link: "/admin"
  });

  if (userId) {
    await createStoreNotification({
      userId,
      audience: "user",
      title: "Pagamento aprovado",
      body: `Pedido ${order.productName ?? ""} recebido. Vamos iniciar a entrega.`,
      type: "payment",
      link: `/pedido/${orderId}?chat=1`
    });
    await notifyUser(userId, "Pagamento aprovado", `Pedido ${order.productName ?? ""} recebido. Vamos iniciar a entrega.`, {
      orderId,
      status: "paid"
    }).catch((error) => console.error("[notifications] User push failed", error));
  }

  await messaging.send({
    topic: "admins",
    notification: {
      title: "Novo pagamento aprovado",
      body: `${order.productName ?? ""} para ${order.robloxUsername ?? ""}`
    },
    data: {
      orderId,
      status: "paid"
    }
  }).catch((error) => console.error("[notifications] Admin push failed", error));
}

export async function grantInitialAdmin(request: ApiRequest) {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new ApiError(401, "unauthenticated", "Faca login com o e-mail administrador.");
  }

  const requesterEmail = normalizeEmail(request.auth.token.email);

  if (!isAllowedAdminEmail(requesterEmail)) {
    throw new ApiError(403, "permission-denied", "E-mail nao autorizado para bootstrap.");
  }

  const bootstrapRef = db.doc("system/bootstrap");
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bootstrapRef);
    const alreadyClaimed = snapshot.exists && snapshot.data()?.adminClaimed === true;

    if (alreadyClaimed) {
      throw new ApiError(409, "already-exists", "Admin inicial ja foi configurado.");
    }

    transaction.set(
      bootstrapRef,
      {
        adminClaimed: true,
        adminUid: request.auth!.uid,
        adminEmail: requesterEmail,
        claimedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await ensureUserDocument(request.auth);
  await db.doc(`users/${request.auth.uid}`).set(
    {
      email: requesterEmail,
      role: "admin",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true, refreshToken: true };
}

export async function seedDefaultCatalog(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);

  const batch = db.batch();

  for (const category of fallbackCategories) {
    batch.set(db.doc(`categories/${category.id}`), {
      ...category,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const product of fallbackProducts) {
    batch.set(db.doc(`products/${product.id}`), {
      ...product,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const review of fallbackReviews) {
    batch.set(db.doc(`reviews/${review.id}`), {
      ...review,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const faq of fallbackFaqs) {
    batch.set(db.doc(`faqs/${faq.id}`), {
      ...faq,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const coupon of fallbackCoupons) {
    batch.set(db.doc(`coupons/${coupon.id}`), {
      ...coupon,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const banner of fallbackBanners) {
    batch.set(db.doc(`banners/${banner.id}`), {
      ...banner,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const popup of fallbackPopups) {
    batch.set(db.doc(`popups/${popup.id}`), {
      ...popup,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  batch.set(db.doc("settings/public"), {
    ...fallbackSettings,
    updatedAt: FieldValue.serverTimestamp()
  });

  await batch.commit();
  await audit(request.auth!.uid, "seedDefaultCatalog", {});

  return { ok: true };
}

export async function ensureInitialCatalog() {
  const batch = db.batch();
  let created = 0;

  async function createIfMissing(path: string, data: Record<string, unknown>) {
    const ref = db.doc(path);
    const snapshot = await ref.get();
    if (snapshot.exists) return;

    batch.set(ref, {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    created += 1;
  }

  for (const category of fallbackCategories) {
    await createIfMissing(`categories/${category.id}`, category as unknown as Record<string, unknown>);
  }

  for (const product of fallbackProducts) {
    await createIfMissing(`products/${product.id}`, product as unknown as Record<string, unknown>);
  }

  for (const coupon of fallbackCoupons) {
    await createIfMissing(`coupons/${coupon.id}`, coupon as unknown as Record<string, unknown>);
  }

  for (const faq of fallbackFaqs) {
    await createIfMissing(`faqs/${faq.id}`, faq as unknown as Record<string, unknown>);
  }

  for (const banner of fallbackBanners) {
    await createIfMissing(`banners/${banner.id}`, banner as unknown as Record<string, unknown>);
  }

  for (const popup of fallbackPopups) {
    await createIfMissing(`popups/${popup.id}`, popup as unknown as Record<string, unknown>);
  }

  await createIfMissing("settings/public", fallbackSettings as unknown as Record<string, unknown>);

  if (created > 0) {
    await batch.commit();
  }

  return { ok: true, created };
}

export async function saveAdminDocument(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-save", 80);

  const collection = sanitizeCollection(request.data.collection);
  const id = sanitizeId(request.data.id);
  const data = validateAdminData(collection, cleanDocumentData(request.data.data));

  await db.doc(`${collection}/${id}`).set(
    {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth!.uid
    },
    { merge: true }
  );
  await audit(
    request.auth!.uid,
    "saveAdminDocument",
    { collection, id },
    {
      email: typeof request.auth!.token.email === "string" ? request.auth!.token.email : null,
      ip: clientIp(request.event),
      entity: collection,
      entityId: id
    }
  );

  return { ok: true };
}

export async function deleteAdminDocument(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-delete", 30);

  const collection = sanitizeCollection(request.data.collection);

  if (collection === "settings") {
    throw new ApiError(412, "failed-precondition", "Configuracoes nao podem ser apagadas.");
  }

  const id = sanitizeId(request.data.id);
  await db.doc(`${collection}/${id}`).delete();
  await audit(
    request.auth!.uid,
    "deleteAdminDocument",
    { collection, id },
    {
      email: typeof request.auth!.token.email === "string" ? request.auth!.token.email : null,
      ip: clientIp(request.event),
      entity: collection,
      entityId: id
    }
  );

  return { ok: true };
}

export async function duplicateAdminDocument(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-duplicate", 30);

  const collection = sanitizeCollection(request.data.collection);
  const id = sanitizeId(request.data.id);
  const newId = sanitizeId(request.data.newId);
  const snapshot = await db.doc(`${collection}/${id}`).get();

  if (!snapshot.exists) {
    throw new ApiError(404, "not-found", "Documento nao encontrado.");
  }

  const source = snapshot.data()!;
  const data = validateAdminData(collection, {
    ...source,
    id: newId,
    name:
      typeof source.name === "string"
        ? `${source.name} copia`
        : typeof source.title === "string"
          ? `${source.title} copia`
          : newId,
    status: "draft"
  });

  await db.doc(`${collection}/${newId}`).set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth!.uid
  });
  await audit(
    request.auth!.uid,
    "duplicateAdminDocument",
    { collection, id, newId },
    { ip: clientIp(request.event), entity: collection, entityId: newId }
  );

  return { ok: true, id: newId };
}

export async function updateUserProfile(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para alterar o perfil.");
  }
  await enforceRateLimit(request.auth.uid, "profile", 20);
  const role = await ensureUserDocument(request.auth);

  const displayName = sanitizeText(request.data.displayName, 80);
  const photoUrl = sanitizeUrl(request.data.photoUrl, true);
  const robloxUsername = sanitizeText(request.data.robloxUsername, 40);
  const soundEnabled = request.data.soundEnabled !== false;
  const profileRef = db.doc(`users/${request.auth.uid}`);
  const existed = (await profileRef.get()).exists;

  await profileRef.set(
    {
      displayName,
      photoUrl,
      photoURL: photoUrl,
      robloxUsername,
      email: typeof request.auth.token.email === "string" ? request.auth.token.email : null,
      role,
      soundEnabled,
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (!existed) {
    await createStoreNotification({
      userId: null,
      audience: "admin",
      title: "Novo usuario",
      body: displayName || request.auth.uid,
      type: "user",
      link: "/admin"
    });
  }

  return { ok: true };
}

export async function syncUserProfile(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para sincronizar o perfil.");
  }

  const role = await ensureUserDocument(request.auth);
  return { ok: true, role };
}

export async function trackProductView(request: ApiRequest) {
  const productId = sanitizeId(request.data.productId);
  const viewer = request.auth?.uid ?? "anonymous";
  await enforceRateLimit(viewer, "product-view", 120);

  await db.doc(`products/${productId}`).set(
    {
      visitCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await db.collection("productViews").add({
    productId,
    userId: request.auth?.uid ?? null,
    createdAt: FieldValue.serverTimestamp()
  });

  return { ok: true };
}

async function ensureConversation(uid: string) {
  const user = await auth.getUser(uid);
  const userDoc = await db.doc(`users/${uid}`).get();
  const profile = userDoc.data() ?? {};
  const displayName =
    typeof profile.displayName === "string" && profile.displayName
      ? profile.displayName
      : user.displayName || user.email || "Cliente";
  const photoUrl =
    typeof profile.photoUrl === "string" && profile.photoUrl ? profile.photoUrl : user.photoURL || "";

  await db.doc(`conversations/${uid}`).set(
    {
      userId: uid,
      type: "support",
      userName: displayName,
      userPhotoUrl: photoUrl,
      userOnline: true,
      adminOnline: false,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return uid;
}

export async function openSupportConversation(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para abrir o suporte.");
  }

  await enforceRateLimit(request.auth.uid, "support-chat", 12, 60_000);
  await ensureUserDocument(request.auth);
  const conversationId = await ensureConversation(request.auth.uid);
  const conversationSnapshot = await db.doc(`conversations/${conversationId}`).get();
  const conversation = conversationSnapshot.data() ?? {};

  if (!conversation.lastMessage) {
    await db.doc(`conversations/${conversationId}`).set(
      {
        lastMessage: "Atendimento aberto.",
        lastMessageAt: FieldValue.serverTimestamp(),
        messageCount: FieldValue.increment(0),
        unreadAdminCount: FieldValue.increment(1),
        unreadUserCount: FieldValue.increment(0),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await createStoreNotification({
    userId: null,
    audience: "admin",
    title: "Novo chat de suporte",
    body: conversation.userName ? `${conversation.userName} abriu atendimento.` : "Cliente abriu atendimento.",
    type: "chat",
    link: "/admin"
  });

  return { ok: true, conversationId };
}

function orderConversationId(orderId: string) {
  return `order_${orderId}`;
}

async function ensureOrderConversation(orderId: string, order: Record<string, unknown>) {
  const userId = await resolveOrderUserId(orderId, order);
  if (!userId) {
    console.error("[chat] Cannot create order conversation without userId", { orderId });
    return "";
  }

  const user = await auth.getUser(userId).catch(() => null);
  const userDoc = await db.doc(`users/${userId}`).get();
  const profile = userDoc.data() ?? {};
  const displayName =
    typeof profile.displayName === "string" && profile.displayName
      ? profile.displayName
      : user?.displayName || user?.email || "Cliente";
  const photoUrl =
    typeof profile.photoUrl === "string" && profile.photoUrl ? profile.photoUrl : user?.photoURL || "";
  const conversationId = orderConversationId(orderId);
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const conversationSnapshot = await conversationRef.get();
  const locked = order.status === "delivered";

  await conversationRef.set(
    {
      userId,
      userName: displayName,
      userPhotoUrl: photoUrl,
      type: "order",
      adminEmail: allowedAdminEmail,
      orderId,
      orderStatus: typeof order.status === "string" ? order.status : "",
      productName: typeof order.productName === "string" ? order.productName : "",
      locked,
      userOnline: false,
      adminOnline: false,
      ...(conversationSnapshot.exists
        ? {}
        : {
            lastMessage: "Pagamento aprovado. Seu pedido esta sendo preparado.",
            lastMessageAt: FieldValue.serverTimestamp(),
            messageCount: 1,
            unreadAdminCount: 0,
            unreadUserCount: 1
          }),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (!conversationSnapshot.exists) {
    await db.doc(`chatMessages/${conversationId}_payment_approved`).set({
      conversationId,
      senderId: "system",
      senderRole: "admin",
      text: "Pagamento aprovado. Seu pedido esta sendo preparado.",
      imageUrl: "",
      status: "received",
      createdAt: FieldValue.serverTimestamp()
    });
    await createStoreNotification({
      userId: null,
      audience: "admin",
      title: "Novo chat de pedido",
      body: `${displayName} iniciou atendimento de ${typeof order.productName === "string" ? order.productName : "pedido"}.`,
      type: "chat",
      link: "/admin"
    });
  }

  return conversationId;
}

async function userCanAccessConversation(conversationId: string, uid: string) {
  const snapshot = await db.doc(`conversations/${conversationId}`).get();
  const data = snapshot.data();
  return snapshot.exists && data?.userId === uid ? { snapshot, data } : null;
}

export async function sendChatMessage(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para enviar mensagens.");
  }
  await enforceRateLimit(request.auth.uid, "chat", 40);
  const role = await ensureUserDocument(request.auth);
  const senderIsAdmin = privilegedRoles.has(role) && request.data.conversationId;

  let conversationId = senderIsAdmin
    ? sanitizeId(request.data.conversationId)
    : typeof request.data.conversationId === "string"
      ? sanitizeId(request.data.conversationId)
      : await ensureConversation(request.auth.uid);
  const text = sanitizeLongText(request.data.text, 1200);
  const imageUrl = sanitizeUrl(request.data.imageUrl, true);

  if (!text && !imageUrl) {
    throw new ApiError(400, "invalid-argument", "Mensagem vazia.");
  }

  if (senderIsAdmin) {
    await assertStaffOrAdmin(request.auth);
  } else if (conversationId === request.auth.uid) {
    conversationId = await ensureConversation(request.auth.uid);
  } else if (conversationId !== request.auth.uid) {
    const access = await userCanAccessConversation(conversationId, request.auth.uid);
    if (!access && conversationId.startsWith("order_")) {
      const orderId = conversationId.replace(/^order_/, "");
      const orderSnapshot = await db.doc(`orders/${orderId}`).get();
      const order = orderSnapshot.data();
      const resolvedOrderUserId = order ? await resolveOrderUserId(orderId, order) : "";
      if (!orderSnapshot.exists || resolvedOrderUserId !== request.auth.uid) {
        throw new ApiError(403, "permission-denied", "Conversa nao autorizada.");
      }
      conversationId = await ensureOrderConversation(orderId, { ...order, userId: resolvedOrderUserId });
      if (!conversationId) {
        throw new ApiError(409, "failed-precondition", "Pedido sem usuario vinculado.");
      }
    } else if (!access) {
      throw new ApiError(403, "permission-denied", "Conversa nao autorizada.");
    }
  }

  const conversationSnapshot = await db.doc(`conversations/${conversationId}`).get();
  const conversation = conversationSnapshot.data() ?? {};
  if (conversation.locked === true) {
    throw new ApiError(412, "failed-precondition", "Esta conversa foi arquivada apos a entrega.");
  }

  const messageRef = db.collection("chatMessages").doc();
  const senderRole = senderIsAdmin ? "admin" : "user";

  await messageRef.set({
    conversationId,
    senderId: request.auth.uid,
    senderRole,
    text,
    imageUrl,
    status: "received",
    createdAt: FieldValue.serverTimestamp()
  });

  await db.doc(`conversations/${conversationId}`).set(
    {
      lastMessage: text || "Imagem enviada",
      lastMessageAt: FieldValue.serverTimestamp(),
      unreadAdminCount: senderRole === "user" ? FieldValue.increment(1) : FieldValue.increment(0),
      unreadUserCount: senderRole === "admin" ? FieldValue.increment(1) : FieldValue.increment(0),
      messageCount: FieldValue.increment(1),
      typingBy: "",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const recipientUserId =
    typeof conversation.userId === "string" && conversation.userId ? conversation.userId : conversationId;
  const orderId = typeof conversation.orderId === "string" ? conversation.orderId : "";

  await createStoreNotification({
    userId: senderRole === "admin" ? recipientUserId : null,
    audience: senderRole === "admin" ? "user" : "admin",
    title: senderRole === "admin" ? "Nova mensagem da MeloBux" : "Novo chat recebido",
    body: text || "Imagem enviada",
    type: "chat",
    link: senderRole === "admin" && orderId ? `/pedido/${orderId}?chat=1` : senderRole === "admin" ? "/suporte" : "/admin"
  });

  if (senderRole === "admin") {
    await notifyUser(recipientUserId, "Nova mensagem da MeloBux", text || "Imagem enviada", {
      type: "chat",
      link: orderId ? `/pedido/${orderId}?chat=1` : "/suporte"
    }).catch((error) => console.error("[notifications] Chat push failed", error));
  }

  await audit(
    request.auth.uid,
    "sendChatMessage",
    { conversationId, senderRole },
    { ip: clientIp(request.event), entity: "conversations", entityId: conversationId }
  );

  return { ok: true, messageId: messageRef.id };
}

export async function markChatRead(request: ApiRequest) {
  if (!request.auth?.uid) throw new ApiError(401, "unauthenticated", "Faca login.");

  const conversationId = sanitizeId(request.data.conversationId ?? request.auth.uid);
  const role = await ensureUserDocument(request.auth);
  const isAdmin = privilegedRoles.has(role);

  if (isAdmin) {
    await assertStaffOrAdmin(request.auth);
  } else if (conversationId !== request.auth.uid) {
    const access = await userCanAccessConversation(conversationId, request.auth.uid);
    if (!access) throw new ApiError(403, "permission-denied", "Conversa nao autorizada.");
  }

  const messages = await db
    .collection("chatMessages")
    .where("conversationId", "==", conversationId)
    .where("senderRole", "==", isAdmin ? "user" : "admin")
    .get();
  const batch = db.batch();

  for (const docSnapshot of messages.docs) {
    batch.set(docSnapshot.ref, { status: "read" }, { merge: true });
  }

  batch.set(
    db.doc(`conversations/${conversationId}`),
    {
      unreadAdminCount: isAdmin ? 0 : FieldValue.increment(0),
      unreadUserCount: isAdmin ? FieldValue.increment(0) : 0,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();

  return { ok: true };
}

export async function setChatTyping(request: ApiRequest) {
  if (!request.auth?.uid) throw new ApiError(401, "unauthenticated", "Faca login.");

  const conversationId = sanitizeId(request.data.conversationId ?? request.auth.uid);
  const role = await ensureUserDocument(request.auth);
  const isAdmin = privilegedRoles.has(role);

  if (isAdmin) {
    await assertStaffOrAdmin(request.auth);
  } else if (conversationId !== request.auth.uid) {
    const access = await userCanAccessConversation(conversationId, request.auth.uid);
    if (!access) throw new ApiError(403, "permission-denied", "Conversa nao autorizada.");
  }

  await db.doc(`conversations/${conversationId}`).set(
    {
      typingBy: request.data.typing === true ? (isAdmin ? "admin" : "user") : "",
      [`${isAdmin ? "admin" : "user"}Online`]: true,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
}

export async function closeConversation(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "chat-close", 30, 60_000);

  const conversationId = sanitizeId(request.data.conversationId);
  await db.doc(`conversations/${conversationId}`).set(
    {
      locked: true,
      closedAt: FieldValue.serverTimestamp(),
      closedBy: request.auth!.uid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await audit(
    request.auth!.uid,
    "closeConversation",
    { conversationId },
    { ip: clientIp(request.event), entity: "conversations", entityId: conversationId }
  );

  return { ok: true };
}

export async function markNotificationRead(request: ApiRequest) {
  if (!request.auth?.uid) throw new ApiError(401, "unauthenticated", "Faca login.");

  const notificationId = sanitizeId(request.data.notificationId);
  const ref = db.doc(`notifications/${notificationId}`);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new ApiError(404, "not-found", "Notificacao nao encontrada.");
  }

  const notification = snapshot.data()!;
  const role = await ensureUserDocument(request.auth);
  const isAdminNotification =
    notification.audience === "admin" && privilegedRoles.has(role);
  const isOwnerNotification = notification.userId === request.auth.uid;

  if (!isAdminNotification && !isOwnerNotification) {
    throw new ApiError(403, "permission-denied", "Notificacao nao autorizada.");
  }

  await ref.set(
    {
      read: true,
      readAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
}

export async function updateOrderStatus(request: ApiRequest) {
  await assertStaffOrAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "order-status", 60);

  const orderId = sanitizeId(request.data.orderId);
  const status = sanitizeText(request.data.status, 40);
  if (!orderStatuses.has(status)) {
    throw new ApiError(400, "invalid-argument", "Status invalido.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) throw new ApiError(404, "not-found", "Pedido nao encontrado.");

  const extra: Record<string, unknown> = {};
  if (status === "delivered") extra.deliveredAt = FieldValue.serverTimestamp();
  if (status === "cancelled") extra.cancelledAt = FieldValue.serverTimestamp();

  await orderRef.set(
    {
      status,
      ...extra,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth!.uid
    },
    { merge: true }
  );

  const order = orderSnapshot.data()!;
  if (order.userId) {
    await ensureOrderConversation(orderId, { ...order, status });
  }
  if (order.userId) {
    const title = status === "delivered" ? "Pedido entregue" : "Pedido atualizado";
    await createStoreNotification({
      userId: String(order.userId),
      audience: "user",
      title,
      body: `${order.productName ?? "Seu pedido"} agora esta com status ${status}.`,
      type: "order",
      link: `/pedido/${orderId}`
    });
    await notifyUser(String(order.userId), title, `${order.productName ?? "Pedido"}: ${status}`, {
      orderId,
      status
    });
  }

  await audit(
    request.auth!.uid,
    "updateOrderStatus",
    { orderId, status },
    { ip: clientIp(request.event), entity: "orders", entityId: orderId }
  );

  return { ok: true };
}

export async function createOrderReview(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para avaliar.");
  }
  await enforceRateLimit(request.auth.uid, "review", 8, 60_000);

  const orderId = sanitizeId(request.data.orderId);
  const rating = sanitizeNumber(request.data.rating, { min: 1, max: 5, integer: true });
  const text = sanitizeLongText(request.data.text, 800);

  if (text.length < 8) {
    throw new ApiError(400, "invalid-argument", "Escreva uma avaliacao um pouco mais detalhada.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) {
    throw new ApiError(404, "not-found", "Pedido nao encontrado.");
  }

  const order = orderSnapshot.data()!;
  if (order.userId !== request.auth.uid) {
    throw new ApiError(403, "permission-denied", "Pedido nao pertence a este usuario.");
  }
  if (order.status !== "delivered") {
    throw new ApiError(412, "failed-precondition", "Avaliacao liberada somente apos entrega finalizada.");
  }

  const reviewId = `order_${orderId}`;
  const reviewRef = db.doc(`reviews/${reviewId}`);
  const reviewSnapshot = await reviewRef.get();
  if (reviewSnapshot.exists) {
    throw new ApiError(409, "already-exists", "Este pedido ja foi avaliado.");
  }

  const authorSource =
    typeof order.robloxUsername === "string" && order.robloxUsername
      ? order.robloxUsername
      : typeof order.buyerEmail === "string" && order.buyerEmail
        ? order.buyerEmail.split("@")[0]
        : "Cliente";

  await reviewRef.set({
    id: reviewId,
    orderId,
    userId: request.auth.uid,
    author: sanitizeText(authorSource, 80, "Cliente"),
    rating,
    text,
    status: "published",
    productId: sanitizeText(order.productId, 80),
    categorySlug: sanitizeText(order.categorySlug, 80),
    sortOrder: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await audit(
    request.auth.uid,
    "createOrderReview",
    { orderId, reviewId, rating },
    { ip: clientIp(request.event), entity: "reviews", entityId: reviewId }
  );

  return { ok: true, reviewId };
}

export async function registerFcmToken(request: ApiRequest) {
  if (!request.auth?.uid) {
    throw new ApiError(401, "unauthenticated", "Faca login para ativar notificacoes.");
  }

  const token = requireString(request.data.token, "Token FCM");
  const role = await ensureUserDocument(request.auth);

  await db.doc(`users/${request.auth.uid}/fcmTokens/${token}`).set(
    {
      token,
      platform: "web",
      userAgent: typeof request.data.userAgent === "string" ? request.data.userAgent.slice(0, 280) : "",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (privilegedRoles.has(role)) {
    await messaging.subscribeToTopic([token], "admins");
  }

  return { ok: true };
}

export async function createCheckoutPreference(request: ApiRequest) {
  const requestAuth = request.auth;
  const buyerUserId = requestAuth?.uid?.trim() ?? "";
  if (!requestAuth || !buyerUserId) {
    throw new ApiError(401, "unauthenticated", "Faca login para comprar.");
  }
  await enforceRateLimit(buyerUserId, "checkout", 12, 60_000);
  const buyerRole = await ensureUserDocument(requestAuth);

  const productId = sanitizeId(request.data.productId);
  const robloxUsername = normalizeRobloxUsername(request.data.robloxUsername);
  const buyerEmail =
    typeof requestAuth.token.email === "string" ? requestAuth.token.email : undefined;

  const productSnapshot = await db.doc(`products/${productId}`).get();

  if (!productSnapshot.exists) {
    throw new ApiError(404, "not-found", "Produto nao encontrado.");
  }

  const product = productSnapshot.data()!;
  if (product.status !== "active") {
    throw new ApiError(412, "failed-precondition", "Produto indisponivel.");
  }
  if (typeof product.stock === "number" && product.stock <= 0) {
    throw new ApiError(412, "failed-precondition", "Produto sem estoque.");
  }

  const price = parseMoney(product.price);
  const coupon = await resolveCoupon(request.data.couponCode, price, buyerUserId);
  const totalPrice = Math.max(0.01, Math.round((price - coupon.discountTotal) * 100) / 100);
  const orderRef = db.collection("orders").doc();
  const orderId = orderRef.id;

  const userRef = db.doc(`users/${buyerUserId}`);
  const userExists = (await userRef.get()).exists;
  await userRef.set(
    {
      email: buyerEmail ?? null,
      displayName: buyerEmail ?? `Cliente ${buyerUserId.slice(0, 6)}`,
      robloxUsername,
      role: buyerRole,
      ...(userExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      lastLoginAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await orderRef.set({
    userId: buyerUserId,
    buyerEmail: buyerEmail ?? null,
    productId,
    categorySlug: product.categorySlug,
    productName: product.name,
    quantity: product.quantity,
    unitPrice: price,
    totalPrice,
    couponCode: coupon.couponCode,
    discountTotal: coupon.discountTotal,
    robloxUsername,
    status: "pending_payment",
    paymentProvider: "mercado_pago",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await createStoreNotification({
    userId: null,
    audience: "admin",
    title: "Nova venda iniciada",
    body: `${product.name} para ${robloxUsername}`,
    type: "order",
    link: "/admin"
  });

  const accessToken = requiredEnv("MERCADO_PAGO_ACCESS_TOKEN");
  const preferenceBody = {
    items: [
      {
        id: productId,
        title: product.name,
        description: product.description,
        quantity: 1,
        currency_id: "BRL",
        unit_price: totalPrice
      }
    ],
    external_reference: orderId,
    payer: buyerEmail ? { email: buyerEmail } : undefined,
    metadata: {
      order_id: orderId,
      product_id: productId,
      user_id: buyerUserId,
      buyer_email: buyerEmail ?? "",
      roblox_username: robloxUsername,
      coupon_code: coupon.couponCode ?? ""
    },
    back_urls: {
      success: `${publicSiteUrl()}/pedido/${orderId}?status=success`,
      failure: `${publicSiteUrl()}/pedido/${orderId}?status=failure`,
      pending: `${publicSiteUrl()}/pedido/${orderId}?status=pending`
    },
    auto_return: "approved",
    notification_url: `${functionOrigin(request.event)}/api/webhook/mercadopago`
  };

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preferenceBody)
  });

  const preferenceText = await response.text();
  let preference: Record<string, unknown> = {};
  try {
    preference = JSON.parse(preferenceText) as Record<string, unknown>;
  } catch {
    preference = { message: preferenceText.slice(0, 360) };
  }

  if (!response.ok) {
    console.error("Mercado Pago preference error", { status: response.status, preference });
    throw new ApiError(412, "failed-precondition", mercadoPagoPreferenceErrorMessage(preference));
  }

  const initPoint = preference.init_point ?? preference.sandbox_init_point;
  if (typeof initPoint !== "string" || !initPoint) {
    throw new ApiError(502, "failed-precondition", "Checkout nao retornou URL de pagamento.");
  }

  await orderRef.set(
    {
      mercadoPagoPreferenceId: preference.id ?? null,
      checkoutUrl: initPoint,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await createStoreNotification({
    userId: null,
    audience: "admin",
    title: "Novo pedido criado",
    body: `${product.name} para ${robloxUsername}`,
    type: "order",
    link: "/admin"
  });

  return {
    orderId,
    initPoint
  };
}

function getHeaderValue(value: string | undefined) {
  return value ?? "";
}

function normalizeMercadoPagoSignatureDataId(dataId: string) {
  return dataId.toLowerCase();
}

function getMercadoPagoEventType(query: Record<string, string | undefined>, body: Record<string, unknown>) {
  return (
    (typeof query.type === "string" && query.type) ||
    (typeof query.topic === "string" && query.topic) ||
    (typeof body.type === "string" && body.type) ||
    (typeof body.topic === "string" && body.topic) ||
    ""
  );
}

async function verifyMercadoPagoSignature(options: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}) {
  const parts = Object.fromEntries(
    options.xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    })
  );

  const ts = parts.ts;
  const v1 = parts.v1;

  if (!ts || !v1) return false;

  const signatureDataId = normalizeMercadoPagoSignatureDataId(options.dataId);
  const manifest = [
    signatureDataId ? `id:${signatureDataId};` : "",
    options.xRequestId ? `request-id:${options.xRequestId};` : "",
    `ts:${ts};`
  ].join("");
  const expected = await hmacSha256Hex(options.secret, manifest);
  return safeCompare(expected, v1);
}

async function fetchMercadoPagoPayment(paymentId: string, accessToken: string) {
  console.log("[MercadoPago webhook] Fetching Mercado Pago payment", { paymentId });
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  console.log("[MercadoPago webhook] Mercado Pago payment API status", {
    paymentId,
    status: response.status,
    ok: response.ok
  });

  if (!response.ok) {
    console.error("[MercadoPago webhook] Mercado Pago payment fetch failed", {
      paymentId,
      status: response.status
    });
    throw new Error(`Mercado Pago payment fetch failed: ${response.status}`);
  }

  const payment = (await response.json()) as Record<string, unknown>;
  console.log("[MercadoPago webhook] Mercado Pago payment API response", payment);
  return payment;
}

export async function processMercadoPagoWebhook(event: ApiEvent) {
  if (event.httpMethod !== "POST") {
    throw new ApiError(405, "method-not-allowed", "Method not allowed");
  }

  const body = parseBody(event);
  const query = event.queryStringParameters ?? {};
  const dataId =
    typeof query["data.id"] === "string"
      ? query["data.id"]
      : typeof (body.data as Record<string, unknown> | undefined)?.id === "string"
        ? String((body.data as Record<string, unknown>).id)
        : "";
  const eventType = getMercadoPagoEventType(query, body);
  console.log("[MercadoPago webhook] Extracted payment data", {
    dataId,
    eventType
  });

  if (eventType !== "payment") {
    console.log("[MercadoPago webhook] Ignored non-payment webhook event before HMAC validation", {
      dataId,
      eventType
    });
    return { ok: true, ignored: true };
  }

  const xSignature = getHeaderValue(event.headers["x-signature"] ?? event.headers["X-Signature"]);
  const xRequestId = getHeaderValue(event.headers["x-request-id"] ?? event.headers["X-Request-Id"]);
  const secret = requiredEnv("MERCADO_PAGO_WEBHOOK_SECRET");
  const signatureValid = await verifyMercadoPagoSignature({
    xSignature,
    xRequestId,
    dataId,
    secret
  });
  console.log("[MercadoPago webhook] Signature validation result", {
    dataId,
    xRequestId,
    valid: signatureValid
  });

  if (!signatureValid) {
    throw new ApiError(401, "permission-denied", "Invalid signature");
  }

  if (!dataId) {
    console.log("[MercadoPago webhook] Ignored webhook event", {
      dataId,
      eventType
    });
    return { ok: true, ignored: true };
  }

  const payment = await fetchMercadoPagoPayment(dataId, requiredEnv("MERCADO_PAGO_ACCESS_TOKEN"));
  const orderId =
    typeof payment.external_reference === "string"
      ? payment.external_reference
      : typeof (payment.metadata as Record<string, unknown> | undefined)?.order_id === "string"
        ? String((payment.metadata as Record<string, unknown>).order_id)
        : "";

  if (!orderId) {
    console.log("[MercadoPago webhook] Payment without order reference, ignoring", {
      dataId,
      paymentStatus: payment.status,
      metadata: payment.metadata
    });
    return { ok: true, ignored: true };
  }

  const mappedStatus =
    payment.status === "approved"
      ? "paid"
      : payment.status === "rejected"
        ? "payment_rejected"
        : payment.status === "cancelled"
          ? "cancelled"
          : "payment_pending";

  console.log("[MercadoPago webhook] Mapped payment status", {
    dataId,
    orderId,
    mercadoPagoStatus: payment.status,
    mappedStatus
  });

  console.log("[MercadoPago webhook] Updating Firestore order", {
    orderPath: `orders/${orderId}`,
    changes: {
      status: mappedStatus,
      mercadoPagoPaymentId: dataId,
      mercadoPagoStatus: payment.status ?? null,
      mercadoPagoStatusDetail: payment.status_detail ?? null,
      paidAt: payment.status === "approved" ? "Timestamp.now()" : null,
      updatedAt: "FieldValue.serverTimestamp()"
    }
  });

  await db.doc(`orders/${orderId}`).set(
    {
      status: mappedStatus,
      mercadoPagoPaymentId: dataId,
      mercadoPagoStatus: payment.status ?? null,
      mercadoPagoStatusDetail: payment.status_detail ?? null,
      paidAt: payment.status === "approved" ? Timestamp.now() : null,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  console.log("[MercadoPago webhook] Firestore order update completed", {
    orderPath: `orders/${orderId}`
  });

  if (mappedStatus === "paid") {
    const orderSnapshot = await db.doc(`orders/${orderId}`).get();
    const order = orderSnapshot.data();
    const resolvedUserId = order ? await resolveOrderUserId(orderId, order, payment) : "";
    const paidOrder: Record<string, unknown> | null = order
      ? {
          ...order,
          userId: resolvedUserId || order.userId,
          status: mappedStatus
        }
      : null;
    const paidOrderUserId = typeof paidOrder?.userId === "string" ? paidOrder.userId : "";
    const paidOrderCouponCode = typeof paidOrder?.couponCode === "string" ? paidOrder.couponCode : "";
    const paidOrderProductId = typeof paidOrder?.productId === "string" ? paidOrder.productId : "";
    console.log("[MercadoPago webhook] Firestore order located", {
      orderPath: `orders/${orderId}`,
      exists: orderSnapshot.exists,
      order: paidOrder ?? order
    });
    if (paidOrder && paidOrderUserId) {
      await ensureOrderConversation(orderId, paidOrder);
    } else {
      console.error("[MercadoPago webhook] Paid order has no userId after resolution", { orderId });
    }
    if (paidOrderCouponCode && paidOrderUserId) {
      console.log("[MercadoPago webhook] Updating Firestore coupon usage", {
        couponPath: `coupons/${paidOrderCouponCode}`,
        couponUsagePath: `couponUsages/${paidOrderCouponCode}_${paidOrderUserId}`,
        changes: {
          couponUsedCount: "+1",
          couponUpdatedAt: "FieldValue.serverTimestamp()",
          couponUsageOrderId: orderId
        }
      });
      await db.doc(`coupons/${paidOrderCouponCode}`).set(
        {
          usedCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await db.doc(`couponUsages/${paidOrderCouponCode}_${paidOrderUserId}`).set(
        {
          couponCode: paidOrderCouponCode,
          userId: paidOrderUserId,
          orderId,
          createdAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      console.log("[MercadoPago webhook] Firestore coupon usage update completed", {
        couponPath: `coupons/${paidOrderCouponCode}`,
        couponUsagePath: `couponUsages/${paidOrderCouponCode}_${paidOrderUserId}`
      });
    }
    if (paidOrderProductId) {
      console.log("[MercadoPago webhook] Updating Firestore product counters", {
        productPath: `products/${paidOrderProductId}`,
        changes: {
          soldCount: "+1",
          stock: "-1",
          updatedAt: "FieldValue.serverTimestamp()"
        }
      });
      await db.doc(`products/${paidOrderProductId}`).set(
        {
          soldCount: FieldValue.increment(1),
          stock: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      console.log("[MercadoPago webhook] Firestore product counters update completed", {
        productPath: `products/${paidOrderProductId}`
      });
    }
    console.log("[MercadoPago webhook] Creating paid order notification", { orderId });
    await notifyOrderPaid(orderId, paidOrder ?? order);
    console.log("[MercadoPago webhook] Paid order notification completed", { orderId });
  }

  console.log("[MercadoPago webhook] Processing completed", {
    dataId,
    orderId,
    mappedStatus
  });
  return { ok: true };
}
