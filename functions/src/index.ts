import { createHmac, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  defaultBanners,
  defaultCategories,
  defaultCoupons,
  defaultFaqs,
  defaultPopups,
  defaultProducts,
  defaultReviews,
  defaultSettings
} from "./defaultCatalog.js";

initializeApp();

setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 20
});

const db = getFirestore();
const auth = getAuth();
const messaging = getMessaging();

const bootstrapAdminEmail = defineString("BOOTSTRAP_ADMIN_EMAIL", {
  default: ""
});
const publicSiteUrl = defineString("PUBLIC_SITE_URL", {
  default: "https://melobux.web.app"
});
const mercadoPagoAccessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const mercadoPagoWebhookSecret = defineSecret("MERCADO_PAGO_WEBHOOK_SECRET");

const callableOptions = {
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  cors: true
};

type AdminCollection =
  | "banners"
  | "categories"
  | "products"
  | "coupons"
  | "faqs"
  | "settings"
  | "popups";

const adminCollections = new Set<AdminCollection>([
  "banners",
  "categories",
  "products",
  "coupons",
  "faqs",
  "settings",
  "popups"
]);

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Payload invalido.");
  }

  return value as Record<string, unknown>;
}

function assertAdmin(requestAuth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!requestAuth) {
    throw new HttpsError("unauthenticated", "Faca login para continuar.");
  }

  if (requestAuth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Usuario sem permissao administrativa.");
  }
}

function sanitizeId(id: unknown) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{2,80}$/.test(id)) {
    throw new HttpsError("invalid-argument", "ID invalido.");
  }

  return id;
}

function sanitizeCollection(collection: unknown): AdminCollection {
  if (typeof collection !== "string" || !adminCollections.has(collection as AdminCollection)) {
    throw new HttpsError("invalid-argument", "Colecao nao permitida.");
  }

  return collection as AdminCollection;
}

function clientIp(request: { rawRequest?: { headers?: Record<string, unknown>; ip?: string } }) {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return request.rawRequest?.ip ?? null;
}

function sanitizeText(value: unknown, maxLength = 240, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "Texto invalido.");
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
    throw new HttpsError("invalid-argument", "Texto invalido.");
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
    throw new HttpsError("invalid-argument", "URL invalida.");
  }
}

function sanitizeNumber(value: unknown, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new HttpsError("invalid-argument", "Numero invalido.");
  }

  const next = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && next < options.min) {
    throw new HttpsError("invalid-argument", "Numero abaixo do minimo.");
  }
  if (options.max !== undefined && next > options.max) {
    throw new HttpsError("invalid-argument", "Numero acima do maximo.");
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
    throw new HttpsError("invalid-argument", `${field} obrigatorio.`);
  }

  return value.trim();
}

function parseMoney(value: unknown) {
  const numberValue = typeof value === "string" ? Number(value) : value;

  if (typeof numberValue !== "number" || !Number.isFinite(numberValue) || numberValue <= 0) {
    throw new HttpsError("invalid-argument", "Preco invalido.");
  }

  return Math.round(numberValue * 100) / 100;
}

function normalizeRobloxUsername(value: unknown) {
  const username = requireString(value, "Usuario Roblox");

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new HttpsError(
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
    throw new HttpsError("failed-precondition", "Cupom nao encontrado.");
  }

  const coupon = couponSnapshot.data()!;
  if (coupon.status !== "active") {
    throw new HttpsError("failed-precondition", "Cupom indisponivel.");
  }

  if (typeof coupon.expiresAt === "string" && coupon.expiresAt) {
    const expiresAt = new Date(`${coupon.expiresAt}T23:59:59-03:00`).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      throw new HttpsError("failed-precondition", "Cupom expirado.");
    }
  }

  const maxUses = typeof coupon.maxUses === "number" ? coupon.maxUses : 0;
  const usedCount = typeof coupon.usedCount === "number" ? coupon.usedCount : 0;
  if (maxUses > 0 && usedCount >= maxUses) {
    throw new HttpsError("failed-precondition", "Cupom esgotado.");
  }

  const minOrderValue = typeof coupon.minOrderValue === "number" ? coupon.minOrderValue : 0;
  if (price < minOrderValue) {
    throw new HttpsError("failed-precondition", "Valor minimo do cupom nao atingido.");
  }

  if (coupon.oncePerUser === true) {
    const usage = await db.doc(`couponUsages/${code}_${uid}`).get();
    if (usage.exists) {
      throw new HttpsError("failed-precondition", "Cupom ja utilizado por este usuario.");
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

function logCheckoutFailure(error: unknown, context: Record<string, unknown>) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};

  logger.error("Checkout failed", {
    ...context,
    message: typeof record.message === "string" ? record.message : String(error),
    code: record.code ?? null,
    stack: typeof record.stack === "string" ? record.stack : null,
    response: record.response ?? null,
    cause: record.cause ?? null
  });
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
      throw new HttpsError("resource-exhausted", "Muitas tentativas. Aguarde um pouco.");
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

export const grantInitialAdmin = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "Faca login com o e-mail administrador.");
  }

  const configuredEmail = bootstrapAdminEmail.value().trim().toLowerCase();
  const requesterEmail = String(request.auth.token.email).trim().toLowerCase();

  if (!configuredEmail || requesterEmail !== configuredEmail) {
    throw new HttpsError("permission-denied", "E-mail nao autorizado para bootstrap.");
  }

  const bootstrapRef = db.doc("system/bootstrap");
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bootstrapRef);
    const alreadyClaimed = snapshot.exists && snapshot.data()?.adminClaimed === true;

    if (alreadyClaimed) {
      throw new HttpsError("already-exists", "Admin inicial ja foi configurado.");
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

  await auth.setCustomUserClaims(request.auth.uid, { admin: true });
  await db.doc(`users/${request.auth.uid}`).set(
    {
      email: requesterEmail,
      role: "admin",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  logger.info("Initial admin granted", { uid: request.auth.uid, email: requesterEmail });

  return { ok: true, refreshToken: true };
});

export const seedDefaultCatalog = onCall(callableOptions, async (request) => {
  assertAdmin(request.auth);

  const batch = db.batch();

  for (const category of defaultCategories) {
    batch.set(db.doc(`categories/${category.id}`), {
      ...category,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const product of defaultProducts) {
    batch.set(db.doc(`products/${product.id}`), {
      ...product,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const review of defaultReviews) {
    batch.set(db.doc(`reviews/${review.id}`), {
      ...review,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const faq of defaultFaqs) {
    batch.set(db.doc(`faqs/${faq.id}`), {
      ...faq,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const coupon of defaultCoupons) {
    batch.set(db.doc(`coupons/${coupon.id}`), {
      ...coupon,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const banner of defaultBanners) {
    batch.set(db.doc(`banners/${banner.id}`), {
      ...banner,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  for (const popup of defaultPopups) {
    batch.set(db.doc(`popups/${popup.id}`), {
      ...popup,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });
  }

  batch.set(db.doc("settings/public"), {
    ...defaultSettings,
    updatedAt: FieldValue.serverTimestamp()
  });

  await batch.commit();
  await audit(request.auth!.uid, "seedDefaultCatalog", {});

  return { ok: true };
});

export const ensureInitialCatalog = onCall(callableOptions, async () => {
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

  for (const category of defaultCategories) {
    await createIfMissing(`categories/${category.id}`, category);
  }

  for (const product of defaultProducts) {
    await createIfMissing(`products/${product.id}`, product);
  }

  for (const coupon of defaultCoupons) {
    await createIfMissing(`coupons/${coupon.id}`, coupon);
  }

  for (const faq of defaultFaqs) {
    await createIfMissing(`faqs/${faq.id}`, faq);
  }

  for (const banner of defaultBanners) {
    await createIfMissing(`banners/${banner.id}`, banner);
  }

  for (const popup of defaultPopups) {
    await createIfMissing(`popups/${popup.id}`, popup);
  }

  await createIfMissing("settings/public", defaultSettings);

  if (created > 0) {
    await batch.commit();
    logger.info("Initial catalog documents created", { created });
  }

  return { ok: true, created };
});

export const saveAdminDocument = onCall(callableOptions, async (request) => {
  assertAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-save", 80);

  const payload = asRecord(request.data);
  const collection = sanitizeCollection(payload.collection);
  const id = sanitizeId(payload.id);
  const data = validateAdminData(collection, cleanDocumentData(payload.data));

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
      ip: clientIp(request),
      entity: collection,
      entityId: id
    }
  );

  return { ok: true };
});

export const deleteAdminDocument = onCall(callableOptions, async (request) => {
  assertAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-delete", 30);

  const payload = asRecord(request.data);
  const collection = sanitizeCollection(payload.collection);

  if (collection === "settings") {
    throw new HttpsError("failed-precondition", "Configuracoes nao podem ser apagadas.");
  }

  const id = sanitizeId(payload.id);
  await db.doc(`${collection}/${id}`).delete();
  await audit(
    request.auth!.uid,
    "deleteAdminDocument",
    { collection, id },
    {
      email: typeof request.auth!.token.email === "string" ? request.auth!.token.email : null,
      ip: clientIp(request),
      entity: collection,
      entityId: id
    }
  );

  return { ok: true };
});

export const duplicateAdminDocument = onCall(callableOptions, async (request) => {
  assertAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "admin-duplicate", 30);

  const payload = asRecord(request.data);
  const collection = sanitizeCollection(payload.collection);
  const id = sanitizeId(payload.id);
  const newId = sanitizeId(payload.newId);
  const snapshot = await db.doc(`${collection}/${id}`).get();

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Documento nao encontrado.");
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
    { ip: clientIp(request), entity: collection, entityId: newId }
  );

  return { ok: true, id: newId };
});

export const updateUserProfile = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faca login para alterar o perfil.");
  }
  await enforceRateLimit(request.auth.uid, "profile", 20);

  const payload = asRecord(request.data);
  const displayName = sanitizeText(payload.displayName, 80);
  const photoUrl = sanitizeUrl(payload.photoUrl, true);
  const robloxUsername = sanitizeText(payload.robloxUsername, 40);
  const soundEnabled = payload.soundEnabled !== false;
  const profileRef = db.doc(`users/${request.auth.uid}`);
  const existed = (await profileRef.get()).exists;

  await profileRef.set(
    {
      displayName,
      photoUrl,
      robloxUsername,
      email: typeof request.auth.token.email === "string" ? request.auth.token.email : null,
      role: request.auth.token.admin === true ? "admin" : "customer",
      soundEnabled,
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (!existed) {
    await createStoreNotification({
      userId: null,
      audience: "admin",
      title: "Novo usuário",
      body: displayName || request.auth.uid,
      type: "user",
      link: "/admin"
    });
  }

  return { ok: true };
});

export const trackProductView = onCall(callableOptions, async (request) => {
  const payload = asRecord(request.data);
  const productId = sanitizeId(payload.productId);
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
});

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

export const sendChatMessage = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faca login para enviar mensagens.");
  }
  await enforceRateLimit(request.auth.uid, "chat", 40);

  const payload = asRecord(request.data);
  const senderIsAdmin = request.auth.token.admin === true && payload.conversationId;
  const conversationId = senderIsAdmin
    ? sanitizeId(payload.conversationId)
    : await ensureConversation(request.auth.uid);
  const text = sanitizeLongText(payload.text, 1200);
  const imageUrl = sanitizeUrl(payload.imageUrl, true);

  if (!text && !imageUrl) {
    throw new HttpsError("invalid-argument", "Mensagem vazia.");
  }

  if (senderIsAdmin) {
    assertAdmin(request.auth);
  } else if (conversationId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Conversa nao autorizada.");
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
      typingBy: "",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await createStoreNotification({
    userId: senderRole === "admin" ? conversationId : null,
    audience: senderRole === "admin" ? "user" : "admin",
    title: senderRole === "admin" ? "Nova mensagem da MeloBux" : "Novo chat recebido",
    body: text || "Imagem enviada",
    type: "chat",
    link: "/"
  });

  if (senderRole === "admin") {
    await notifyUser(conversationId, "Nova mensagem da MeloBux", text || "Imagem enviada", {
      type: "chat"
    });
  }

  await audit(
    request.auth.uid,
    "sendChatMessage",
    { conversationId, senderRole },
    { ip: clientIp(request), entity: "conversations", entityId: conversationId }
  );

  return { ok: true, messageId: messageRef.id };
});

export const markChatRead = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faca login.");

  const payload = asRecord(request.data);
  const conversationId = sanitizeId(payload.conversationId ?? request.auth.uid);
  const isAdmin = request.auth.token.admin === true;

  if (!isAdmin && conversationId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Conversa nao autorizada.");
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
});

export const setChatTyping = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faca login.");

  const payload = asRecord(request.data);
  const conversationId = sanitizeId(payload.conversationId ?? request.auth.uid);
  const isAdmin = request.auth.token.admin === true;

  if (!isAdmin && conversationId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Conversa nao autorizada.");
  }

  await db.doc(`conversations/${conversationId}`).set(
    {
      typingBy: payload.typing === true ? (isAdmin ? "admin" : "user") : "",
      [`${isAdmin ? "admin" : "user"}Online`]: true,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
});

export const markNotificationRead = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faca login.");

  const payload = asRecord(request.data);
  const notificationId = sanitizeId(payload.notificationId);
  const ref = db.doc(`notifications/${notificationId}`);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Notificacao nao encontrada.");
  }

  const notification = snapshot.data()!;
  const isAdminNotification =
    notification.audience === "admin" && request.auth.token.admin === true;
  const isOwnerNotification = notification.userId === request.auth.uid;

  if (!isAdminNotification && !isOwnerNotification) {
    throw new HttpsError("permission-denied", "Notificacao nao autorizada.");
  }

  await ref.set(
    {
      read: true,
      readAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
});

export const updateOrderStatus = onCall(callableOptions, async (request) => {
  assertAdmin(request.auth);
  await enforceRateLimit(request.auth!.uid, "order-status", 60);

  const payload = asRecord(request.data);
  const orderId = sanitizeId(payload.orderId);
  const status = sanitizeText(payload.status, 40);
  if (!orderStatuses.has(status)) {
    throw new HttpsError("invalid-argument", "Status invalido.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) throw new HttpsError("not-found", "Pedido nao encontrado.");

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
    { ip: clientIp(request), entity: "orders", entityId: orderId }
  );

  return { ok: true };
});

export const createOrderReview = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faca login para avaliar.");
  }
  await enforceRateLimit(request.auth.uid, "review", 8, 60_000);

  const payload = asRecord(request.data);
  const orderId = sanitizeId(payload.orderId);
  const rating = sanitizeNumber(payload.rating, { min: 1, max: 5, integer: true });
  const text = sanitizeLongText(payload.text, 800);

  if (text.length < 8) {
    throw new HttpsError("invalid-argument", "Escreva uma avaliacao um pouco mais detalhada.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) {
    throw new HttpsError("not-found", "Pedido nao encontrado.");
  }

  const order = orderSnapshot.data()!;
  if (order.userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Pedido nao pertence a este usuario.");
  }
  if (order.status !== "delivered") {
    throw new HttpsError("failed-precondition", "Avaliacao liberada somente apos entrega finalizada.");
  }

  const reviewId = `order_${orderId}`;
  const reviewRef = db.doc(`reviews/${reviewId}`);
  const reviewSnapshot = await reviewRef.get();
  if (reviewSnapshot.exists) {
    throw new HttpsError("already-exists", "Este pedido ja foi avaliado.");
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
    { ip: clientIp(request), entity: "reviews", entityId: reviewId }
  );

  return { ok: true, reviewId };
});

export const registerFcmToken = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faca login para ativar notificacoes.");
  }

  const payload = asRecord(request.data);
  const token = requireString(payload.token, "Token FCM");

  await db.doc(`users/${request.auth.uid}/fcmTokens/${token}`).set(
    {
      token,
      platform: "web",
      userAgent: typeof payload.userAgent === "string" ? payload.userAgent.slice(0, 280) : "",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (request.auth.token.admin === true) {
    await messaging.subscribeToTopic([token], "admins");
  }

  return { ok: true };
});

export const createCheckoutPreference = onCall(
  { ...callableOptions, secrets: [mercadoPagoAccessToken] },
  async (request) => {
    const checkoutLogContext: Record<string, unknown> = {
      uid: request.auth?.uid ?? null,
      hasAuth: Boolean(request.auth?.uid)
    };

    logger.info("Checkout started", checkoutLogContext);

    try {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Faca login para comprar.");
      }
      logger.info("Checkout user authenticated", { uid: request.auth.uid });

      logger.info("Checkout rate limit checking", { uid: request.auth.uid });
      await enforceRateLimit(request.auth.uid, "checkout", 12, 60_000);
      logger.info("Checkout rate limit ok", { uid: request.auth.uid });

      logger.info("Checkout payload parsing", { uid: request.auth.uid });
      const payload = asRecord(request.data);
      const productId = sanitizeId(payload.productId);
      const robloxUsername = normalizeRobloxUsername(payload.robloxUsername);
      const buyerEmail =
        typeof request.auth?.token.email === "string" ? request.auth.token.email : undefined;
      checkoutLogContext.productId = productId;
      checkoutLogContext.hasCoupon = Boolean(sanitizeText(payload.couponCode, 40));
      checkoutLogContext.hasBuyerEmail = Boolean(buyerEmail);
      logger.info("Checkout payload parsed", {
        uid: request.auth.uid,
        productId,
        hasCoupon: checkoutLogContext.hasCoupon,
        hasBuyerEmail: checkoutLogContext.hasBuyerEmail
      });

      logger.info("Checkout product loading", { uid: request.auth.uid, productId });
      const productSnapshot = await db.doc(`products/${productId}`).get();
      logger.info("Checkout product loaded", {
        uid: request.auth.uid,
        productId,
        exists: productSnapshot.exists
      });

      if (!productSnapshot.exists) {
        throw new HttpsError("not-found", "Produto nao encontrado.");
      }

      const product = productSnapshot.data()!;
      checkoutLogContext.categorySlug = product.categorySlug ?? null;
      logger.info("Checkout product validating", {
        uid: request.auth.uid,
        productId,
        status: product.status ?? null,
        stock: product.stock ?? null,
        categorySlug: product.categorySlug ?? null
      });
      if (product.status !== "active") {
        throw new HttpsError("failed-precondition", "Produto indisponivel.");
      }
      if (typeof product.stock === "number" && product.stock <= 0) {
        throw new HttpsError("failed-precondition", "Produto sem estoque.");
      }
      logger.info("Checkout product validated", { uid: request.auth.uid, productId });

      const price = parseMoney(product.price);
      checkoutLogContext.price = price;
      logger.info("Checkout price calculated", { uid: request.auth.uid, productId, price });

      logger.info("Checkout coupon validating", {
        uid: request.auth.uid,
        productId,
        hasCoupon: checkoutLogContext.hasCoupon
      });
      const coupon = await resolveCoupon(payload.couponCode, price, request.auth.uid);
      const totalPrice = Math.max(0.01, Math.round((price - coupon.discountTotal) * 100) / 100);
      checkoutLogContext.couponCode = coupon.couponCode ?? null;
      checkoutLogContext.discountTotal = coupon.discountTotal;
      checkoutLogContext.totalPrice = totalPrice;
      logger.info("Checkout coupon validated", {
        uid: request.auth.uid,
        productId,
        couponCode: coupon.couponCode ?? null,
        discountTotal: coupon.discountTotal,
        totalPrice
      });

      const orderRef = db.collection("orders").doc();
      const orderId = orderRef.id;
      const siteUrl = publicSiteUrl.value().replace(/\/$/, "");
      checkoutLogContext.orderId = orderId;
      checkoutLogContext.siteUrl = siteUrl;
      logger.info("Checkout order initialized", { uid: request.auth.uid, productId, orderId, siteUrl });

      const userRef = db.doc(`users/${request.auth.uid}`);
      logger.info("Checkout user document loading", { uid: request.auth.uid });
      const userExists = (await userRef.get()).exists;
      logger.info("Checkout user document loaded", { uid: request.auth.uid, userExists });

      logger.info("Checkout user document writing", { uid: request.auth.uid, userExists });
      await userRef.set(
        {
          email: buyerEmail ?? null,
          displayName: buyerEmail ?? `Cliente ${request.auth.uid.slice(0, 6)}`,
          robloxUsername,
          role: request.auth.token.admin === true ? "admin" : "customer",
          ...(userExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          lastSeenAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      logger.info("Checkout user document written", { uid: request.auth.uid });

      logger.info("Checkout order writing", { uid: request.auth.uid, productId, orderId });
      await orderRef.set({
        userId: request.auth.uid,
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
      logger.info("Checkout order written", { uid: request.auth.uid, productId, orderId });

      logger.info("Checkout Mercado Pago token reading", { uid: request.auth.uid, orderId });
      const accessToken = mercadoPagoAccessToken.value();
      checkoutLogContext.hasMercadoPagoAccessToken = Boolean(accessToken);
      logger.info("Checkout Mercado Pago token read", {
        uid: request.auth.uid,
        orderId,
        hasMercadoPagoAccessToken: Boolean(accessToken)
      });
      if (!accessToken) {
        throw new HttpsError("failed-precondition", "Mercado Pago nao configurado.");
      }

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
          roblox_username: robloxUsername,
          coupon_code: coupon.couponCode ?? ""
        },
        back_urls: {
          success: `${siteUrl}/pedido/${orderId}?status=success`,
          failure: `${siteUrl}/pedido/${orderId}?status=failure`,
          pending: `${siteUrl}/pedido/${orderId}?status=pending`
        },
        auto_return: "approved",
        notification_url: `${siteUrl}/api/mercadopago/webhook`
      };
      logger.info("Checkout Mercado Pago preference prepared", {
        uid: request.auth.uid,
        productId,
        orderId,
        totalPrice,
        siteUrl
      });

      logger.info("Checkout Mercado Pago preference creating", { uid: request.auth.uid, orderId });
      const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(preferenceBody)
      });
      logger.info("Checkout Mercado Pago preference response received", {
        uid: request.auth.uid,
        orderId,
        status: response.status,
        ok: response.ok
      });

      logger.info("Checkout Mercado Pago preference reading body", { uid: request.auth.uid, orderId });
      const preferenceText = await response.text();
      logger.info("Checkout Mercado Pago preference body read", {
        uid: request.auth.uid,
        orderId,
        bodyLength: preferenceText.length
      });

      let preference: Record<string, unknown> = {};
      try {
        preference = JSON.parse(preferenceText) as Record<string, unknown>;
        logger.info("Checkout Mercado Pago preference body parsed", {
          uid: request.auth.uid,
          orderId,
          preferenceId: preference.id ?? null
        });
      } catch {
        preference = { message: preferenceText.slice(0, 360) };
        logger.info("Checkout Mercado Pago preference body was not JSON", {
          uid: request.auth.uid,
          orderId
        });
      }

      if (!response.ok) {
        logger.error("Mercado Pago preference error", { status: response.status, preference });
        throw new HttpsError("failed-precondition", mercadoPagoPreferenceErrorMessage(preference));
      }

      logger.info("Checkout order writing Mercado Pago preference", {
        uid: request.auth.uid,
        productId,
        orderId,
        preferenceId: preference.id ?? null,
        hasInitPoint: Boolean(preference.init_point ?? preference.sandbox_init_point)
      });
      await orderRef.set(
        {
          mercadoPagoPreferenceId: preference.id ?? null,
          checkoutUrl: preference.init_point ?? preference.sandbox_init_point ?? null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      logger.info("Checkout order Mercado Pago preference written", { uid: request.auth.uid, orderId });

      logger.info("Checkout admin notification creating", { uid: request.auth.uid, orderId });
      await createStoreNotification({
        userId: null,
        audience: "admin",
        title: "Novo pedido criado",
        body: `${product.name} para ${robloxUsername}`,
        type: "order",
        link: "/admin"
      });
      logger.info("Checkout admin notification created", { uid: request.auth.uid, orderId });

      logger.info("Checkout returning", {
        uid: request.auth.uid,
        orderId,
        hasInitPoint: Boolean(preference.init_point ?? preference.sandbox_init_point)
      });
      return {
        orderId,
        initPoint: preference.init_point ?? preference.sandbox_init_point
      };
    } catch (error) {
      logCheckoutFailure(error, checkoutLogContext);
      throw error;
    }
  }
);

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function verifyMercadoPagoSignature(options: {
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

  if (!ts || !v1 || !options.xRequestId || !options.dataId) return false;

  const manifest = `id:${options.dataId};request-id:${options.xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", options.secret).update(manifest).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(v1);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

async function fetchMercadoPagoPayment(paymentId: string, accessToken: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago payment fetch failed: ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export const mercadoPagoWebhook = onRequest(
  {
    cors: false,
    secrets: [mercadoPagoAccessToken, mercadoPagoWebhookSecret]
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const dataId =
      typeof request.query["data.id"] === "string"
        ? request.query["data.id"]
        : typeof request.body?.data?.id === "string"
          ? request.body.data.id
          : "";
    const xSignature = getHeaderValue(request.headers["x-signature"]);
    const xRequestId = getHeaderValue(request.headers["x-request-id"]);
    const secret = mercadoPagoWebhookSecret.value();

    if (
      secret &&
      !verifyMercadoPagoSignature({
        xSignature,
        xRequestId,
        dataId,
        secret
      })
    ) {
      logger.warn("Mercado Pago webhook signature rejected", { dataId, xRequestId });
      response.status(401).send("Invalid signature");
      return;
    }

    response.status(200).send("ok");

    try {
      const eventType = request.body?.type ?? request.body?.topic;
      if (eventType !== "payment" || !dataId) {
        logger.info("Ignored Mercado Pago webhook", { eventType, dataId });
        return;
      }

      const payment = await fetchMercadoPagoPayment(dataId, mercadoPagoAccessToken.value());
      const orderId =
        typeof payment.external_reference === "string"
          ? payment.external_reference
          : typeof (payment.metadata as Record<string, unknown> | undefined)?.order_id === "string"
            ? String((payment.metadata as Record<string, unknown>).order_id)
            : "";

      if (!orderId) {
        logger.warn("Payment without order reference", { dataId });
        return;
      }

      const mappedStatus =
        payment.status === "approved"
          ? "paid"
          : payment.status === "rejected"
            ? "payment_rejected"
            : payment.status === "cancelled"
              ? "cancelled"
              : "payment_pending";

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

      if (mappedStatus === "paid") {
        const orderSnapshot = await db.doc(`orders/${orderId}`).get();
        const order = orderSnapshot.data();
        if (order?.couponCode && order?.userId) {
          await db.doc(`coupons/${order.couponCode}`).set(
            {
              usedCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
          await db.doc(`couponUsages/${order.couponCode}_${order.userId}`).set(
            {
              couponCode: order.couponCode,
              userId: order.userId,
              orderId,
              createdAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
        if (order?.productId) {
          await db.doc(`products/${order.productId}`).set(
            {
              soldCount: FieldValue.increment(1),
              stock: FieldValue.increment(-1),
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
        await notifyOrderPaid(orderId);
      }
    } catch (error) {
      logger.error("Mercado Pago webhook processing failed", error);
    }
  }
);

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

async function notifyUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>
) {
  const tokensSnapshot = await db.collection(`users/${userId}/fcmTokens`).get();
  const tokens = tokensSnapshot.docs.map((doc) => doc.id);

  if (tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    webpush: {
      fcmOptions: {
        link: `${publicSiteUrl.value().replace(/\/$/, "")}${data.orderId ? `/pedido/${data.orderId}` : "/"}`
      }
    }
  });
}

async function notifyOrderPaid(orderId: string) {
  const orderSnapshot = await db.doc(`orders/${orderId}`).get();
  const order = orderSnapshot.data();

  if (!order?.userId) return;

  await createStoreNotification({
    userId: String(order.userId),
    audience: "user",
    title: "Pagamento aprovado",
    body: `Pedido ${order.productName ?? ""} recebido. Vamos iniciar a entrega.`,
    type: "payment",
    link: `/pedido/${orderId}`
  });
  await createStoreNotification({
    userId: null,
    audience: "admin",
    title: "Novo pagamento aprovado",
    body: `${order.productName ?? ""} para ${order.robloxUsername ?? ""}`,
    type: "payment",
    link: "/admin"
  });

  await notifyUser(String(order.userId), "Pagamento aprovado", `Pedido ${order.productName ?? ""} recebido. Vamos iniciar a entrega.`, {
    orderId,
    status: "paid"
  });
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
  });
}
