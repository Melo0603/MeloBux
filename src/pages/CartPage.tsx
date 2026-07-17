import { CreditCard, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/LoadingState";
import { useCartContext } from "../context/CartContext";
import { rememberPendingCheckoutOrder } from "../lib/checkoutSession";
import { formatCurrency, formatRobux } from "../lib/format";
import { createCheckoutPreference } from "../services/catalog";

export function CartPage() {
  const { items, total, removeItem } = useCartContext();
  const [busyItem, setBusyItem] = useState("");
  const [message, setMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");

  async function checkout(productId: string, robloxUsername: string) {
    setBusyItem(`${productId}:${robloxUsername}`);
    setMessage("");

    try {
      const response = await createCheckoutPreference({ productId, robloxUsername, couponCode });
      rememberPendingCheckoutOrder(response.data.orderId);
      window.location.href = response.data.initPoint;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o checkout.");
      setBusyItem("");
    }
  }

  return (
    <main className="content-shell">
      <div className="section-heading">
        <h1>Carrinho</h1>
        <strong>{formatCurrency(total)}</strong>
      </div>

      <label className="field cart-coupon">
        Cupom
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase().trim())}
          placeholder="MELO10"
        />
      </label>

      {items.length ? (
        <div className="cart-list">
          {items.map((item) => {
            const busy = busyItem === `${item.productId}:${item.robloxUsername}`;
            return (
              <article key={`${item.productId}:${item.robloxUsername}`} className="cart-row">
                <div>
                  <strong>{item.productName}</strong>
                  <span>
                    {formatRobux(item.quantity)} Robux para {item.robloxUsername}
                  </span>
                </div>
                <strong>{formatCurrency(item.price)}</strong>
                <button
                  type="button"
                  className="secondary-button icon-only"
                  title="Remover"
                  onClick={() => removeItem(item.productId, item.robloxUsername)}
                >
                  <Trash2 size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => checkout(item.productId, item.robloxUsername)}
                >
                  <CreditCard size={18} aria-hidden />
                  Comprar
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState>Seu carrinho está vazio.</EmptyState>
      )}

      {message ? <p className="form-message">{message}</p> : null}
    </main>
  );
}
