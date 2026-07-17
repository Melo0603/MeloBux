import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  type DocumentData
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getToken } from "firebase/messaging";
import { auth, db, isFirebaseConfigured, messagingPromise, storage } from "../lib/firebase";
import {
  fallbackBanners,
  fallbackCategories,
  fallbackCoupons,
  fallbackFaqs,
  fallbackPopups,
  fallbackProducts,
  fallbackProfile,
  fallbackReviews,
  fallbackSettings
} from "../data/defaultContent";
import type {
  AdminCollectionName,
  AuditLog,
  Banner,
  Category,
  ChatConversation,
  ChatMessage,
  Coupon,
  Faq,
  Order,
  Product,
  Review,
  StoreNotification,
  StorePopup,
  StoreSettings,
  UserProfile
} from "../types";

type Listener<T> = (value: T) => void;
let initialCatalogRequested = false;

function withId<T>(document: DocumentData, id: string) {
  return { id, ...document } as T;
}

function fallbackUnsubscribe<T>(value: T, onValue: Listener<T>) {
  window.setTimeout(() => onValue(value), 0);
  return () => undefined;
}

function sortByOrder<T extends { sortOrder?: number; name?: string; question?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const orderA = a.sortOrder ?? 999;
    const orderB = b.sortOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name ?? a.question ?? "").localeCompare(String(b.name ?? b.question ?? ""));
  });
}

function requestInitialCatalog() {
  if (!isFirebaseConfigured || initialCatalogRequested) return;
  initialCatalogRequested = true;
  void ensureInitialCatalog().catch(() => {
    initialCatalogRequested = false;
  });
}

function normalizeImageUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;

  const legacyRobloxImage =
    value.includes("roblox.com/avatar-thumbnail") ||
    value.includes("roblox.com/headshot-thumbnail");

  if (!legacyRobloxImage) return value;
  return value.includes("headshot") ? fallbackSettings.ownerAvatarUrl : fallbackSettings.homeBannerImageUrl;
}

function normalizeSettings(settings: StoreSettings): StoreSettings {
  return {
    ...settings,
    homeBannerImageUrl: normalizeImageUrl(settings.homeBannerImageUrl, fallbackSettings.homeBannerImageUrl),
    ownerAvatarUrl: normalizeImageUrl(settings.ownerAvatarUrl, fallbackSettings.ownerAvatarUrl)
  };
}

function normalizeCategory(category: Category): Category {
  const categoryFallback =
    category.slug === "gamepass" ? fallbackSettings.ownerAvatarUrl : fallbackSettings.homeBannerImageUrl;

  return {
    ...category,
    imageUrl: normalizeImageUrl(category.imageUrl, categoryFallback),
    bannerUrl: normalizeImageUrl(category.bannerUrl, fallbackSettings.homeBannerImageUrl)
  };
}

function normalizeProduct(product: Product): Product {
  const productFallback =
    product.categorySlug === "gamepass"
      ? fallbackSettings.homeBannerImageUrl
      : fallbackSettings.ownerAvatarUrl;

  return {
    ...product,
    imageUrl: normalizeImageUrl(product.imageUrl, productFallback),
    gallery: product.gallery?.map((imageUrl) => normalizeImageUrl(imageUrl, productFallback))
  };
}

function getFallbackCategory(slug: string) {
  return fallbackCategories.map(normalizeCategory).find((category) => category.slug === slug) ?? null;
}

function getFallbackProducts(categorySlug: string | null) {
  const products = categorySlug
    ? fallbackProducts.filter((product) => product.categorySlug === categorySlug)
    : fallbackProducts;
  return products.map(normalizeProduct);
}

function getFallbackProduct(productId: string) {
  return fallbackProducts.map(normalizeProduct).find((product) => product.id === productId) ?? null;
}

function normalizeBanner(banner: Banner): Banner {
  return {
    ...banner,
    imageUrl: normalizeImageUrl(banner.imageUrl, fallbackSettings.homeBannerImageUrl)
  };
}

function normalizePopup(popup: StorePopup): StorePopup {
  return {
    ...popup,
    imageUrl: popup.imageUrl
      ? normalizeImageUrl(popup.imageUrl, fallbackSettings.ownerAvatarUrl)
      : undefined
  };
}

function normalizeProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    photoUrl: normalizeImageUrl(profile.photoUrl, fallbackSettings.ownerAvatarUrl)
  };
}

function normalizeConversation(conversation: ChatConversation): ChatConversation {
  return {
    ...conversation,
    userPhotoUrl: normalizeImageUrl(conversation.userPhotoUrl, fallbackSettings.ownerAvatarUrl)
  };
}

export function subscribeSettings(onValue: Listener<StoreSettings>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(normalizeSettings(fallbackSettings), onValue);
  }

  return onSnapshot(doc(db, "settings", "public"), (snapshot) => {
    const settings = snapshot.exists() ? withId<StoreSettings>(snapshot.data(), snapshot.id) : fallbackSettings;
    onValue(normalizeSettings(settings));
  });
}

export function subscribeCategories(onValue: Listener<Category[]>, admin = false) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackCategories.map(normalizeCategory), onValue);
  }

  const categoriesQuery = admin
    ? query(collection(db, "categories"))
    : query(
        collection(db, "categories"),
        where("status", "==", "active"),
        orderBy("sortOrder", "asc")
      );

  return onSnapshot(
    categoriesQuery,
    (snapshot) => {
      const categories = snapshot.docs.map((item) => normalizeCategory(withId<Category>(item.data(), item.id)));
      if (!categories.length) {
        requestInitialCatalog();
        onValue(fallbackCategories.map(normalizeCategory));
        return;
      }
      onValue(sortByOrder(categories));
    },
    () => {
      requestInitialCatalog();
      onValue(fallbackCategories.map(normalizeCategory));
    }
  );
}

export function subscribeCategory(slug: string, onValue: Listener<Category | null>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(getFallbackCategory(slug), onValue);
  }

  const fallbackCategory = getFallbackCategory(slug);
  if (fallbackCategory) onValue(fallbackCategory);

  const categoryQuery = query(collection(db, "categories"), where("slug", "==", slug));

  return onSnapshot(
    categoryQuery,
    (snapshot) => {
      const category = snapshot.docs[0];
      if (category) {
        onValue(normalizeCategory(withId<Category>(category.data(), category.id)));
        return;
      }

      if (fallbackCategory) requestInitialCatalog();
      onValue(fallbackCategory);
    },
    () => {
      if (fallbackCategory) requestInitialCatalog();
      onValue(fallbackCategory);
    }
  );
}

export function subscribeProducts(
  categorySlug: string | null,
  onValue: Listener<Product[]>,
  admin = false
) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(getFallbackProducts(categorySlug), onValue);
  }

  const fallbackProductsForScope = getFallbackProducts(categorySlug);
  if (fallbackProductsForScope.length) onValue(sortByOrder(fallbackProductsForScope));

  const productsQuery =
    admin || !categorySlug
      ? query(collection(db, "products"))
      : query(
          collection(db, "products"),
          where("categorySlug", "==", categorySlug),
          where("status", "==", "active"),
          orderBy("sortOrder", "asc")
        );

  return onSnapshot(
    productsQuery,
    (snapshot) => {
      const products = snapshot.docs.map((item) => normalizeProduct(withId<Product>(item.data(), item.id)));
      if (!products.length) {
        if (fallbackProductsForScope.length) {
          requestInitialCatalog();
          onValue(sortByOrder(fallbackProductsForScope));
          return;
        }
      }
      onValue(sortByOrder(products));
    },
    () => {
      if (fallbackProductsForScope.length) {
        requestInitialCatalog();
        onValue(sortByOrder(fallbackProductsForScope));
      }
    }
  );
}

export async function getProduct(productId: string) {
  if (!isFirebaseConfigured || !db) {
    return getFallbackProduct(productId);
  }

  try {
    const snapshot = await getDoc(doc(db, "products", productId));
    if (snapshot.exists()) return normalizeProduct(withId<Product>(snapshot.data(), snapshot.id));
  } catch {
    const fallbackProduct = getFallbackProduct(productId);
    if (fallbackProduct) requestInitialCatalog();
    return fallbackProduct;
  }

  const fallbackProduct = getFallbackProduct(productId);
  if (fallbackProduct) requestInitialCatalog();
  return fallbackProduct;
}

export function subscribeProduct(productId: string, onValue: Listener<Product | null>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(getFallbackProduct(productId), onValue);
  }

  const fallbackProduct = getFallbackProduct(productId);
  if (fallbackProduct) onValue(fallbackProduct);

  return onSnapshot(
    doc(db, "products", productId),
    (snapshot) => {
      if (snapshot.exists()) {
        onValue(normalizeProduct(withId<Product>(snapshot.data(), snapshot.id)));
        return;
      }

      if (fallbackProduct) requestInitialCatalog();
      onValue(fallbackProduct);
    },
    () => {
      if (fallbackProduct) requestInitialCatalog();
      onValue(fallbackProduct);
    }
  );
}

export function subscribeReviews(onValue: Listener<Review[]>, admin = false) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackReviews, onValue);
  }

  const reviewsQuery = admin
    ? query(collection(db, "reviews"))
    : query(collection(db, "reviews"), where("status", "==", "published"));

  return onSnapshot(
    reviewsQuery,
    (snapshot) => {
      const reviews = snapshot.docs.map((item) => withId<Review>(item.data(), item.id));
      onValue(sortByOrder(reviews));
    },
    () => onValue(fallbackReviews)
  );
}

export function subscribeFaqs(onValue: Listener<Faq[]>, admin = false) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackFaqs, onValue);
  }

  const faqQuery = admin
    ? query(collection(db, "faqs"))
    : query(collection(db, "faqs"), where("status", "==", "published"));

  return onSnapshot(
    faqQuery,
    (snapshot) => {
      const faqs = snapshot.docs.map((item) => withId<Faq>(item.data(), item.id));
      onValue(sortByOrder(faqs));
    },
    () => onValue(fallbackFaqs)
  );
}

export function subscribeCoupons(onValue: Listener<Coupon[]>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackCoupons, onValue);
  }

  return onSnapshot(
    collection(db, "coupons"),
    (snapshot) => {
      if (snapshot.empty) {
        requestInitialCatalog();
        onValue(fallbackCoupons);
        return;
      }
      onValue(snapshot.docs.map((item) => withId<Coupon>(item.data(), item.id)));
    },
    () => {
      requestInitialCatalog();
      onValue(fallbackCoupons);
    }
  );
}

export function subscribeBanners(onValue: Listener<Banner[]>, admin = false) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackBanners.map(normalizeBanner), onValue);
  }

  const bannerQuery = admin
    ? query(collection(db, "banners"))
    : query(collection(db, "banners"), where("status", "==", "active"), orderBy("sortOrder", "asc"));

  return onSnapshot(bannerQuery, (snapshot) => {
    onValue(sortByOrder(snapshot.docs.map((item) => normalizeBanner(withId<Banner>(item.data(), item.id)))));
  });
}

export function subscribePopups(onValue: Listener<StorePopup[]>, admin = false) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(fallbackPopups.map(normalizePopup), onValue);
  }

  const popupQuery = admin
    ? query(collection(db, "popups"))
    : query(collection(db, "popups"), where("status", "==", "active"), orderBy("sortOrder", "asc"));

  return onSnapshot(popupQuery, (snapshot) => {
    onValue(sortByOrder(snapshot.docs.map((item) => normalizePopup(withId<StorePopup>(item.data(), item.id)))));
  });
}

export function subscribeOrders(onValue: Listener<Order[]>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  return onSnapshot(collection(db, "orders"), (snapshot) => {
    onValue(snapshot.docs.map((item) => withId<Order>(item.data(), item.id)));
  });
}

function timestampMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis() as number;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime() as number;
  }
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortOrdersByCreatedAt(orders: Order[]) {
  return [...orders].sort((first, second) => timestampMillis(second.createdAt) - timestampMillis(first.createdAt));
}

export function subscribeUserOrders(
  userId: string | null | undefined,
  buyerEmail: string | null | undefined,
  onValue: Listener<Order[]>
) {
  if (!userId || !isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  const byUserIdQuery = query(
    collection(db, "orders"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const normalizedEmail = buyerEmail?.trim() ?? "";
  const byEmailQuery = normalizedEmail
    ? query(collection(db, "orders"), where("buyerEmail", "==", normalizedEmail), orderBy("createdAt", "desc"))
    : null;
  let byUserId: Order[] = [];
  let byEmail: Order[] = [];

  function publish() {
    const merged = new Map<string, Order>();
    for (const order of [...byUserId, ...byEmail]) {
      merged.set(order.id, order);
    }
    onValue(sortOrdersByCreatedAt([...merged.values()]));
  }

  const unsubscribeByUserId = onSnapshot(byUserIdQuery, (snapshot) => {
    byUserId = snapshot.docs.map((item) => withId<Order>(item.data(), item.id));
    publish();
  });

  const unsubscribeByEmail = byEmailQuery
    ? onSnapshot(byEmailQuery, (snapshot) => {
        byEmail = snapshot.docs.map((item) => withId<Order>(item.data(), item.id));
        publish();
      })
    : undefined;

  return () => {
    unsubscribeByUserId();
    unsubscribeByEmail?.();
  };
}

export function subscribeOrder(orderId: string, onValue: Listener<Order | null>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(null, onValue);
  }

  return onSnapshot(doc(db, "orders", orderId), (snapshot) => {
    onValue(snapshot.exists() ? withId<Order>(snapshot.data(), snapshot.id) : null);
  });
}

export function subscribeUserProfile(userId: string | null | undefined, onValue: Listener<UserProfile | null>) {
  if (!userId || !isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(normalizeProfile(fallbackProfile), onValue);
  }

  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    onValue(snapshot.exists() ? normalizeProfile(withId<UserProfile>(snapshot.data(), snapshot.id)) : null);
  });
}

export function subscribeUsers(onValue: Listener<UserProfile[]>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([normalizeProfile(fallbackProfile)], onValue);
  }

  return onSnapshot(collection(db, "users"), (snapshot) => {
    onValue(snapshot.docs.map((item) => normalizeProfile(withId<UserProfile>(item.data(), item.id))));
  });
}

export function subscribeNotifications(
  userId: string | null | undefined,
  isAdmin: boolean,
  onValue: Listener<StoreNotification[]>
) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  const notificationsQuery = isAdmin
    ? query(collection(db, "notifications"), where("audience", "==", "admin"), orderBy("createdAt", "desc"), limit(60))
    : userId
      ? query(collection(db, "notifications"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(60))
      : null;

  if (!notificationsQuery) return fallbackUnsubscribe([], onValue);

  return onSnapshot(notificationsQuery, (snapshot) => {
    onValue(snapshot.docs.map((item) => withId<StoreNotification>(item.data(), item.id)));
  });
}

export function subscribeConversations(onValue: Listener<ChatConversation[]>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  return onSnapshot(query(collection(db, "conversations"), orderBy("lastMessageAt", "desc")), (snapshot) => {
    onValue(snapshot.docs.map((item) => normalizeConversation(withId<ChatConversation>(item.data(), item.id))));
  });
}

export function subscribeConversation(userId: string | null | undefined, onValue: Listener<ChatConversation | null>) {
  if (!userId || !isFirebaseConfigured || !db) {
    return fallbackUnsubscribe(null, onValue);
  }

  return onSnapshot(doc(db, "conversations", userId), (snapshot) => {
    onValue(snapshot.exists() ? normalizeConversation(withId<ChatConversation>(snapshot.data(), snapshot.id)) : null);
  });
}

export function subscribeChatMessages(conversationId: string | null | undefined, onValue: Listener<ChatMessage[]>) {
  if (!conversationId || !isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  return onSnapshot(
    query(collection(db, "chatMessages"), where("conversationId", "==", conversationId), orderBy("createdAt", "asc")),
    (snapshot) => {
      onValue(snapshot.docs.map((item) => withId<ChatMessage>(item.data(), item.id)));
    }
  );
}

export function subscribeAuditLogs(onValue: Listener<AuditLog[]>) {
  if (!isFirebaseConfigured || !db) {
    return fallbackUnsubscribe([], onValue);
  }

  return onSnapshot(query(collection(db, "adminAudit"), orderBy("createdAt", "desc"), limit(120)), (snapshot) => {
    onValue(snapshot.docs.map((item) => withId<AuditLog>(item.data(), item.id)));
  });
}

function requireAuthenticatedUser(message = "Faca login para continuar.") {
  if (!auth) throw new Error("Firebase Authentication nao esta configurado.");
  if (!auth.currentUser) throw new Error(message);
  return auth.currentUser;
}

function netlifyFunctionsBaseUrl() {
  return (import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");
}

async function netlifyRequest<TRequest, TResponse>(
  endpoint: "admin" | "auth" | "checkout",
  payload: TRequest,
  options: { authRequired?: boolean } = {}
): Promise<{ data: TResponse }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const user = auth?.currentUser ?? null;

  if (options.authRequired !== false) {
    if (!user) throw new Error("Faca login para continuar.");
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } else if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  const response = await fetch(`${netlifyFunctionsBaseUrl()}/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : "Erro ao chamar backend.";
    throw new Error(message);
  }

  return body as { data: TResponse };
}

function authAction<TRequest, TResponse>(action: string, data: TRequest) {
  return netlifyRequest<{ action: string; data: TRequest }, TResponse>(
    "auth",
    { action, data },
    { authRequired: false }
  );
}

function adminAction<TRequest, TResponse>(
  action: string,
  data: TRequest,
  options?: { authRequired?: boolean }
) {
  return netlifyRequest<{ action: string; data: TRequest }, TResponse>(
    "admin",
    { action, data },
    options
  );
}

async function compressImage(file: File, maxSize = 1400, quality = 0.82) {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality)
  );

  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
}

export async function grantInitialAdmin() {
  return adminAction<void, { ok: boolean; refreshToken?: boolean }>("grantInitialAdmin", undefined);
}

export async function requestAuthCode(payload: {
  email: string;
  purpose: "login" | "password_reset";
}) {
  return authAction<typeof payload, { ok: boolean }>("requestAuthCode", payload);
}

export async function verifyAuthCode(payload: {
  email: string;
  code: string;
}) {
  return authAction<typeof payload, { ok: boolean; customToken: string }>("verifyAuthCode", payload);
}

export async function resetPasswordWithCode(payload: {
  email: string;
  code: string;
  password: string;
}) {
  return authAction<typeof payload, { ok: boolean; customToken: string }>("resetPasswordWithCode", payload);
}

export async function seedDefaultCatalog() {
  return adminAction<void, { ok: boolean }>("seedDefaultCatalog", undefined);
}

export async function ensureInitialCatalog() {
  if (!isFirebaseConfigured) {
    return { data: { ok: true, created: 0 } };
  }
  return adminAction<void, { ok: boolean; created: number }>(
    "ensureInitialCatalog",
    undefined,
    { authRequired: false }
  );
}

export async function saveAdminDocument<T extends Record<string, unknown>>(payload: {
  collection: AdminCollectionName;
  id: string;
  data: T;
}) {
  return adminAction<typeof payload, { ok: boolean }>("saveAdminDocument", payload);
}

export async function deleteAdminDocument(payload: {
  collection: AdminCollectionName;
  id: string;
}) {
  return adminAction<typeof payload, { ok: boolean }>("deleteAdminDocument", payload);
}

export async function duplicateAdminDocument(payload: {
  collection: AdminCollectionName;
  id: string;
  newId: string;
}) {
  return adminAction<typeof payload, { ok: boolean; id: string }>("duplicateAdminDocument", payload);
}

export async function updateUserProfile(payload: {
  displayName: string;
  photoUrl: string;
  robloxUsername?: string;
  soundEnabled?: boolean;
}) {
  return adminAction<typeof payload, { ok: boolean }>("updateUserProfile", payload);
}

export async function syncUserProfile() {
  return adminAction<void, { ok: boolean; role: "customer" | "staff" | "admin" }>(
    "syncUserProfile",
    undefined
  );
}

export async function ensureAnonymousSession() {
  return requireAuthenticatedUser();
}

export async function trackProductView(productId: string) {
  if (!isFirebaseConfigured) return { data: { ok: true } };
  return adminAction<{ productId: string }, { ok: boolean }>(
    "trackProductView",
    { productId },
    { authRequired: false }
  );
}

export async function sendChatMessage(payload: {
  conversationId?: string;
  text: string;
  imageUrl?: string;
}) {
  return adminAction<typeof payload, { ok: boolean; messageId: string }>("sendChatMessage", payload);
}

export async function openSupportConversation() {
  return adminAction<void, { ok: boolean; conversationId: string }>("openSupportConversation", undefined);
}

export async function closeConversation(conversationId: string) {
  return adminAction<{ conversationId: string }, { ok: boolean }>("closeConversation", { conversationId });
}

export async function markChatRead(conversationId?: string) {
  return adminAction<{ conversationId?: string }, { ok: boolean }>("markChatRead", { conversationId });
}

export async function setChatTyping(payload: { conversationId?: string; typing: boolean }) {
  return adminAction<typeof payload, { ok: boolean }>("setChatTyping", payload);
}

export async function updateOrderStatus(payload: { orderId: string; status: string }) {
  return adminAction<typeof payload, { ok: boolean }>("updateOrderStatus", payload);
}

export async function createOrderReview(payload: {
  orderId: string;
  rating: number;
  text: string;
}) {
  return adminAction<typeof payload, { ok: boolean; reviewId: string }>("createOrderReview", payload);
}

export async function markNotificationRead(notificationId: string) {
  return adminAction<{ notificationId: string }, { ok: boolean }>("markNotificationRead", { notificationId });
}

export async function createCheckoutPreference(payload: {
  productId: string;
  robloxUsername: string;
  couponCode?: string;
}) {
  if (!auth) throw new Error("Firebase Authentication não está configurado.");
  requireAuthenticatedUser("Faca login para comprar.");

  return netlifyRequest<typeof payload, { orderId: string; initPoint: string }>("checkout", payload);
}

export async function uploadAdminImage(file: File, path: string) {
  if (!storage) throw new Error("Firebase Storage não está configurado.");

  const compressed = await compressImage(file);
  const safePath = path.replace(/\.[^.]+$/, ".webp");
  const imageRef = ref(storage, safePath);
  await uploadBytes(imageRef, compressed, { contentType: compressed.type });
  return getDownloadURL(imageRef);
}

export async function uploadUserImage(file: File, userId: string, folder = "profile") {
  if (!storage) throw new Error("Firebase Storage não está configurado.");

  const compressed = await compressImage(file, 1000, 0.84);
  const name = file.name.replace(/\.[^.]+$/, ".webp");
  const imageRef = ref(storage, `users/${userId}/${folder}/${Date.now()}-${name}`);
  await uploadBytes(imageRef, compressed, { contentType: compressed.type });
  return getDownloadURL(imageRef);
}

export async function enableWebNotifications() {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("VAPID key não configurada.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada.");

  const messaging = await messagingPromise;
  if (!messaging) throw new Error("FCM não está disponível neste navegador.");

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  await adminAction<{ token: string; userAgent: string }, { ok: boolean }>("registerFcmToken", {
    token,
    userAgent: navigator.userAgent
  });

  return token;
}
