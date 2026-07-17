import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ChatPanel } from "../ChatPanel";
import { formatCurrency } from "../../lib/format";
import { closeConversation, updateOrderStatus } from "../../services/catalog";
import type { ChatConversation, Order } from "../../types";

export function AdminChat({ conversations, orders }: { conversations: ChatConversation[]; orders: Order[] }) {
  const [selected, setSelected] = useState(conversations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(
    () =>
      conversations.filter((item) =>
        [item.userName, item.userId, item.lastMessage].join(" ").toLowerCase().includes(search.toLowerCase())
      ),
    [conversations, search]
  );
  const current = conversations.find((item) => item.id === selected) || filtered[0] || null;
  const currentOrder = current?.orderId ? orders.find((order) => order.id === current.orderId) : null;

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Acao nao concluida.");
    }
  }

  return (
    <section className="admin-chat-layout">
      <aside className="chat-conversation-list">
        <label className="field search-field">
          Buscar usuário
          <span>
            <Search size={18} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        {filtered.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={current?.id === conversation.id ? "active" : ""}
            onClick={() => setSelected(conversation.id)}
          >
            <img src={conversation.userPhotoUrl || "/icon.svg"} alt="" />
            <span>
              <strong>{conversation.userName}</strong>
              <small>{conversation.userOnline ? "Online" : "Offline"} · {conversation.lastMessage}</small>
            </span>
            {conversation.unreadAdminCount ? <i>{conversation.unreadAdminCount}</i> : null}
          </button>
        ))}
      </aside>
      {current ? (
        <div className="admin-chat-workspace">
          <div className="admin-chat-summary">
            <div>
              <span>Cliente</span>
              <strong>{current.userName}</strong>
            </div>
            <div>
              <span>Produto</span>
              <strong>{currentOrder?.productName || current.productName || "Suporte"}</strong>
            </div>
            <div>
              <span>Pedido</span>
              <strong>{current.orderId || "Atendimento"}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{currentOrder ? formatCurrency(currentOrder.totalPrice) : "-"}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{currentOrder?.status || (current.locked ? "fechada" : "aberta")}</strong>
            </div>
          </div>
          <div className="action-row admin-chat-actions">
            {currentOrder ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => run(() => updateOrderStatus({ orderId: currentOrder.id, status: "delivering" }), "Entrega iniciada.")}
                >
                  Enviar Robux
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => run(() => updateOrderStatus({ orderId: currentOrder.id, status: "delivered" }), "Pedido entregue.")}
                >
                  Marcar entregue
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => run(() => updateOrderStatus({ orderId: currentOrder.id, status: "cancelled" }), "Pedido cancelado.")}
                >
                  Cancelar pedido
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={() => run(() => closeConversation(current.id), "Conversa fechada.")}
            >
              Fechar conversa
            </button>
          </div>
          {message ? <p className="form-message">{message}</p> : null}
          <ChatPanel adminMode conversationId={current.id} conversation={current} />
        </div>
      ) : (
        <div className="empty-state">Nenhuma conversa aberta.</div>
      )}
    </section>
  );
}
