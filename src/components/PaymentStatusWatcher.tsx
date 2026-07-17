import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { clearPendingCheckoutOrder, readPendingCheckoutOrder } from "../lib/checkoutSession";
import { subscribeOrder } from "../services/catalog";

const terminalStatuses = new Set(["paid", "delivered", "cancelled", "payment_rejected"]);

export function PaymentStatusWatcher() {
  const { isAuthenticated } = useAuthUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const orderId = readPendingCheckoutOrder();
    if (!orderId) return undefined;

    return subscribeOrder(orderId, (order) => {
      if (!order) return;

      if (order.status === "paid") {
        clearPendingCheckoutOrder(orderId);
        navigate(`/pedido/${orderId}?chat=1`);
        return;
      }

      if (terminalStatuses.has(order.status)) {
        clearPendingCheckoutOrder(orderId);
      }
    });
  }, [isAuthenticated, navigate]);

  return null;
}
