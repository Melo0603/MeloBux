import { MessageCircle, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { EmptyState } from "../components/LoadingState";
import { useAuthUser } from "../hooks/useAuthUser";
import { useConversation, useUserOrders } from "../hooks/useStoreContent";
import { formatCurrency, formatRobux } from "../lib/format";
import { formatDate } from "../lib/time";
import { isOrderDelivered, orderConversationId, orderStatusLabel } from "../lib/orders";
import type { Order } from "../types";

function OrderList({
  empty,
  onOpenChat,
  orders
}: {
  empty: string;
  onOpenChat: (order: Order) => void;
  orders: Order[];
}) {
  if (!orders.length) return <EmptyState>{empty}</EmptyState>;

  return (
    <div className="purchase-list">
      {orders.map((order) => (
        <article key={order.id} className="purchase-card">
          <div>
            <strong>{order.productName}</strong>
            <span>{formatRobux(order.quantity)} Robux</span>
            <small>{formatDate(order.createdAt)}</small>
          </div>
          <div>
            <b>{formatCurrency(order.totalPrice)}</b>
            <span>{orderStatusLabel(order.status)}</span>
            {order.mercadoPagoPaymentId ? <small>Comprovante: {order.mercadoPagoPaymentId}</small> : null}
          </div>
          <div className="purchase-actions">
            <Link className="secondary-button" to={`/pedido/${order.id}`}>
              <ReceiptText size={17} aria-hidden />
              Detalhes
            </Link>
            <button type="button" className="primary-button" onClick={() => onOpenChat(order)}>
              <MessageCircle size={17} aria-hidden />
              Abrir chat
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PurchasesPage() {
  const { user } = useAuthUser();
  const orders = useUserOrders(user?.uid, user?.email);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const selectedConversationId = selectedOrderId ? orderConversationId(selectedOrderId) : "";
  const selectedConversation = useConversation(selectedConversationId);

  const inProgress = useMemo(
    () => orders.filter((order) => !isOrderDelivered(order.status)),
    [orders]
  );
  const history = useMemo(
    () => orders.filter((order) => isOrderDelivered(order.status)),
    [orders]
  );
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);

  return (
    <main className="content-shell purchases-page">
      <h1>Suas compras</h1>

      <section className="review-gate">
        <h2>Pedidos em andamento</h2>
        <OrderList
          empty="Nenhum pedido em andamento."
          orders={inProgress}
          onOpenChat={(order) => setSelectedOrderId(order.id)}
        />
      </section>

      <section className="review-gate">
        <h2>Historico</h2>
        <OrderList
          empty="Seu historico ainda esta vazio."
          orders={history}
          onOpenChat={(order) => setSelectedOrderId(order.id)}
        />
      </section>

      {selectedOrder ? (
        <section className="review-gate">
          <h2>Conversa arquivada do pedido</h2>
          <p className="empty-copy">
            {selectedOrder.productName} · {orderStatusLabel(selectedOrder.status)}
          </p>
          <ChatPanel conversationId={selectedConversationId} conversation={selectedConversation} />
        </section>
      ) : null}
    </main>
  );
}
