import { CheckCircle2, Send, Star } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { EmptyState } from "../components/LoadingState";
import { RatingStars } from "../components/RatingStars";
import { useAuthUser } from "../hooks/useAuthUser";
import { useConversation, useReviews } from "../hooks/useStoreContent";
import { formatCurrency, formatRobux } from "../lib/format";
import { isOrderChatAvailable, orderConversationId, orderStatusLabel } from "../lib/orders";
import { createOrderReview, subscribeOrder } from "../services/catalog";
import type { Order } from "../types";

export function OrderPage() {
  const { orderId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuthUser();
  const [order, setOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reviews = useReviews(false);
  const chatRef = useRef<HTMLElement | null>(null);
  const conversationId = orderConversationId(orderId);
  const conversation = useConversation(conversationId);

  useEffect(() => subscribeOrder(orderId, setOrder), [orderId]);

  const orderReview = useMemo(
    () => reviews.find((review) => review.orderId === orderId),
    [orderId, reviews]
  );
  const isOwner = Boolean(order && user?.uid && order.userId === user.uid);
  const canReview = Boolean(isOwner && order?.status === "delivered" && !orderReview);
  const isPaid = order?.status === "paid";
  const statusLabel = order ? orderStatusLabel(order.status) : "";
  const showChat = Boolean(order && isOwner && isOrderChatAvailable(order.status));

  useEffect(() => {
    if (showChat && searchParams.get("chat") === "1") {
      chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams, showChat]);

  if (!order) {
    return (
      <main className="content-shell">
        <EmptyState>Pedido nao encontrado ou acesso nao autorizado.</EmptyState>
      </main>
    );
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReview) return;

    setBusy(true);
    setMessage("");

    try {
      await createOrderReview({ orderId, rating, text });
      setText("");
      setMessage("Avaliacao enviada. Obrigado por comprar na MeloBux.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel enviar a avaliacao.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="content-shell order-page">
      <h1>Pedido {order.id}</h1>
      {isPaid ? (
        <section className="order-paid-card" aria-live="polite">
          <CheckCircle2 size={30} aria-hidden />
          <div>
            <h2>Pagamento aprovado!</h2>
            <p>Seu pagamento foi confirmado pelo Mercado Pago. Seu pedido esta sendo preparado.</p>
          </div>
        </section>
      ) : null}
      <div className="order-summary">
        <span>Status</span>
        <strong>{statusLabel}</strong>
        <span>Produto</span>
        <strong>{order.productName}</strong>
        <span>Quantidade</span>
        <strong>{formatRobux(order.quantity)} Robux</strong>
        <span>Usuario Roblox</span>
        <strong>{order.robloxUsername}</strong>
        <span>Total</span>
        <strong>{formatCurrency(order.totalPrice)}</strong>
      </div>

      {showChat ? (
        <section className="review-gate" ref={chatRef}>
          <h2>Chat do pedido</h2>
          <ChatPanel conversationId={conversationId} conversation={conversation} />
        </section>
      ) : null}

      <section className="review-gate">
        <h2>Avaliacao da compra</h2>
        {orderReview ? (
          <article className="compact-item">
            <RatingStars rating={orderReview.rating} />
            <strong>{orderReview.author}</strong>
            <p>{orderReview.text}</p>
          </article>
        ) : canReview ? (
          <form className="admin-form" onSubmit={submitReview}>
            <label className="field">
              Nota
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                <option value={5}>5 estrelas</option>
                <option value={4}>4 estrelas</option>
                <option value={3}>3 estrelas</option>
                <option value={2}>2 estrelas</option>
                <option value={1}>1 estrela</option>
              </select>
            </label>
            <label className="field">
              Comentario
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                minLength={8}
                maxLength={800}
                placeholder="Conte como foi sua compra"
                required
              />
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              <Send size={18} aria-hidden />
              Enviar avaliacao
            </button>
          </form>
        ) : (
          <p className="empty-copy">
            <Star size={16} aria-hidden />
            A avaliacao libera automaticamente quando o admin marca o pedido como entregue.
          </p>
        )}
        {message ? <p className="form-message">{message}</p> : null}
      </section>
    </main>
  );
}
