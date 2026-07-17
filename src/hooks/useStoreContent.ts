import { useEffect, useState } from "react";
import {
  subscribeCategories,
  subscribeBanners,
  subscribePopups,
  subscribeFaqs,
  subscribeProducts,
  subscribeReviews,
  subscribeSettings,
  subscribeCoupons,
  subscribeUserOrders,
  subscribeUserProfile,
  subscribeNotifications,
  subscribeConversations,
  subscribeConversation,
  subscribeChatMessages,
  subscribeAuditLogs,
  subscribeUsers
} from "../services/catalog";
import type {
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

export function useSettings() {
  const [settings, setSettings] = useState<StoreSettings>(fallbackSettings);

  useEffect(() => subscribeSettings(setSettings), []);

  return settings;
}

export function useCategories(admin = false) {
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);

  useEffect(() => subscribeCategories(setCategories, admin), [admin]);

  return categories;
}

export function useProducts(categorySlug: string | null = null, admin = false) {
  const [products, setProducts] = useState<Product[]>(
    categorySlug
      ? fallbackProducts.filter((product) => product.categorySlug === categorySlug)
      : fallbackProducts
  );

  useEffect(() => subscribeProducts(categorySlug, setProducts, admin), [admin, categorySlug]);

  return products;
}

export function useReviews(admin = false) {
  const [reviews, setReviews] = useState<Review[]>(fallbackReviews);

  useEffect(() => subscribeReviews(setReviews, admin), [admin]);

  return reviews;
}

export function useFaqs(admin = false) {
  const [faqs, setFaqs] = useState<Faq[]>(fallbackFaqs);

  useEffect(() => subscribeFaqs(setFaqs, admin), [admin]);

  return faqs;
}

export function useCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>(fallbackCoupons);

  useEffect(() => subscribeCoupons(setCoupons), []);

  return coupons;
}

export function useBanners(admin = false) {
  const [banners, setBanners] = useState<Banner[]>(fallbackBanners);

  useEffect(() => subscribeBanners(setBanners, admin), [admin]);

  return banners;
}

export function usePopups(admin = false) {
  const [popups, setPopups] = useState<StorePopup[]>(fallbackPopups);

  useEffect(() => subscribePopups(setPopups, admin), [admin]);

  return popups;
}

export function useUserOrders(userId: string | null | undefined, buyerEmail?: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => subscribeUserOrders(userId, buyerEmail, setOrders), [buyerEmail, userId]);

  return orders;
}

export function useUserProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(fallbackProfile);

  useEffect(() => subscribeUserProfile(userId, setProfile), [userId]);

  return profile;
}

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => subscribeUsers(setUsers), []);

  return users;
}

export function useNotifications(
  userId: string | null | undefined,
  isAdmin: boolean
) {
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);

  useEffect(() => subscribeNotifications(userId, isAdmin, setNotifications), [isAdmin, userId]);

  return notifications;
}

export function useConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);

  useEffect(() => subscribeConversations(setConversations), []);

  return conversations;
}

export function useConversation(userId: string | null | undefined) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);

  useEffect(() => subscribeConversation(userId, setConversation), [userId]);

  return conversation;
}

export function useChatMessages(conversationId: string | null | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => subscribeChatMessages(conversationId, setMessages), [conversationId]);

  return messages;
}

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => subscribeAuditLogs(setLogs), []);

  return logs;
}
