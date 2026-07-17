export type ContentStatus = "active" | "published" | "draft" | "archived";

export interface Category {
  id: string;
  slug: string;
  name: string;
  imageUrl: string;
  bannerUrl: string;
  description: string;
  deliveryTime: string;
  importantInfo: string;
  deliveryNotice: string;
  ratingAverage: number;
  ratingCount: number;
  status: ContentStatus;
  sortOrder: number;
  chatUrl?: string;
}

export interface Product {
  id: string;
  categorySlug: string;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  status: ContentStatus;
  sortOrder: number;
  description: string;
  deliveryTime: string;
  guarantees: string[];
  paymentMethods: string[];
  faqIds: string[];
  imageUrl?: string;
  gallery?: string[];
  soldCount?: number;
  visitCount?: number;
  createdAt?: unknown;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  homeBannerImageUrl: string;
  ownerName: string;
  ownerRobloxUsername: string;
  ownerRobloxUserId: string;
  ownerAvatarUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  whatsappUrl: string;
  notice: string;
  policy: string;
  guarantees: string[];
  paymentMethods: string[];
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  status: ContentStatus;
  productId?: string;
  categorySlug?: string;
  userId?: string;
  orderId?: string;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  status: ContentStatus;
  sortOrder: number;
}

export interface Coupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  status: ContentStatus;
  expiresAt?: string;
  maxUses?: number;
  usedCount?: number;
  minOrderValue?: number;
  oncePerUser?: boolean;
  maxUsesPerUser?: number;
  description?: string;
}

export interface Order {
  id: string;
  userId?: string | null;
  buyerEmail?: string | null;
  productId: string;
  categorySlug: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  robloxUsername: string;
  status: string;
  mercadoPagoPaymentId?: string;
  mercadoPagoStatus?: string;
  couponCode?: string | null;
  discountTotal?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  deliveredAt?: unknown;
  cancelledAt?: unknown;
  checkoutUrl?: string;
  paidAt?: unknown;
}

export interface CartItem {
  productId: string;
  productName: string;
  categorySlug: string;
  quantity: number;
  price: number;
  robloxUsername: string;
}

export type AdminCollectionName =
  | "categories"
  | "products"
  | "coupons"
  | "faqs"
  | "settings"
  | "banners"
  | "popups";

export interface UserProfile {
  id: string;
  displayName: string;
  photoUrl: string;
  email?: string | null;
  role?: "customer" | "staff" | "admin";
  robloxUsername?: string;
  robloxUserId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastSeenAt?: unknown;
  soundEnabled?: boolean;
}

export type ChatStatus = "received" | "read";

export interface ChatConversation {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl: string;
  adminEmail?: string;
  type?: "support" | "order";
  locked?: boolean;
  lastMessage: string;
  lastMessageAt?: unknown;
  messageCount?: number;
  orderId?: string;
  orderStatus?: string;
  productName?: string;
  unreadAdminCount: number;
  unreadUserCount: number;
  userOnline: boolean;
  adminOnline: boolean;
  typingBy?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: "user" | "admin";
  text: string;
  imageUrl?: string;
  status: ChatStatus;
  createdAt?: unknown;
}

export interface StoreNotification {
  id: string;
  userId?: string | null;
  audience: "user" | "admin";
  title: string;
  body: string;
  type:
    | "payment"
    | "order"
    | "chat"
    | "coupon"
    | "user"
    | "system";
  sound: boolean;
  read: boolean;
  link?: string;
  createdAt?: unknown;
}

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  buttonLabel: string;
  url: string;
  status: ContentStatus;
  sortOrder: number;
}

export interface StorePopup {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  buttonLabel: string;
  url: string;
  type: "welcome" | "promotion" | "coupon" | "update";
  status: ContentStatus;
  sortOrder: number;
}

export interface AuditLog {
  id: string;
  uid: string;
  email?: string | null;
  ip?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt?: unknown;
}
