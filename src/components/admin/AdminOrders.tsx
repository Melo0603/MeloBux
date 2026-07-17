import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency } from "../../lib/format";
import { formatDate } from "../../lib/time";
import { updateOrderStatus } from "../../services/catalog";
import type { Order } from "../../types";

const statusOptions = [
  ["all", "Todos"],
  ["pending_payment", "Aguardando pagamento"],
  ["paid", "Pagamento aprovado"],
  ["processing", "Em processamento"],
  ["delivering", "Em entrega"],
  ["delivered", "Concluído"],
  ["cancelled", "Cancelado"]
];

export function AdminOrders({ orders }: { orders: Order[] }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return orders.filter((order) => {
      const statusOk = status === "all" || order.status === status;
      const text = [order.productName, order.userId, order.id, order.robloxUsername].join(" ").toLowerCase();
      return statusOk && (!term || text.includes(term));
    });
  }, [orders, search, status]);

  return (
    <section className="admin-form wide-form">
      <div className="section-heading">
        <h2>Pedidos</h2>
        <span>{filtered.length} encontrados</span>
      </div>
      <div className="order-filters">
        <label className="field">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field search-field">
          Pesquisar
          <span>
            <Search size={18} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, UID ou número do pedido"
            />
          </span>
        </label>
      </div>
      <div className="orders-table">
        {filtered.map((order) => (
          <article key={order.id} className="admin-order-row">
            <div>
              <strong>{order.productName}</strong>
              <span>{order.id}</span>
              <span>UID: {order.userId || "Não vinculado"}</span>
            </div>
            <span>{order.robloxUsername}</span>
            <span>{formatCurrency(order.totalPrice)}</span>
            <span>{formatDate(order.createdAt)}</span>
            <label className="field">
              Status
              <select value={order.status} onChange={(event) => updateOrderStatus({ orderId: order.id, status: event.target.value })}>
                {statusOptions.slice(1).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {order.status !== "delivered" ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => updateOrderStatus({ orderId: order.id, status: "delivered" })}
              >
                Marcar como entregue
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
