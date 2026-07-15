import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "../types";

const cartKey = "robux-store-cart";

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(cartKey);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(readCart);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((product: Product, robloxUsername: string) => {
    setItems((current) => {
      const existing = current.find(
        (item) => item.productId === product.id && item.robloxUsername === robloxUsername
      );

      if (existing) return current;

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          categorySlug: product.categorySlug,
          quantity: product.quantity,
          price: product.price,
          robloxUsername
        }
      ];
    });
  }, []);

  const removeItem = useCallback((productId: string, robloxUsername: string) => {
    setItems((current) =>
      current.filter(
        (item) => item.productId !== productId || item.robloxUsername !== robloxUsername
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price, 0),
    [items]
  );

  return {
    items,
    total,
    addItem,
    removeItem,
    clearCart,
    count: items.length
  };
}
