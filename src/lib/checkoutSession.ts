const pendingCheckoutOrderKey = "melobux:pendingCheckoutOrderId";

export function rememberPendingCheckoutOrder(orderId: string) {
  try {
    if (orderId) localStorage.setItem(pendingCheckoutOrderKey, orderId);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

export function readPendingCheckoutOrder() {
  try {
    return localStorage.getItem(pendingCheckoutOrderKey) || "";
  } catch {
    return "";
  }
}

export function clearPendingCheckoutOrder(orderId?: string) {
  try {
    const current = localStorage.getItem(pendingCheckoutOrderKey);
    if (!orderId || current === orderId) {
      localStorage.removeItem(pendingCheckoutOrderKey);
    }
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}
