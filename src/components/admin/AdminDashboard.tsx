import { BarChart3, CreditCard, MessageSquare, PackageCheck, Users } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { formatCurrency } from "../../lib/format";
import { isSamePeriod } from "../../lib/time";
import type { ChatConversation, Order, Product, UserProfile } from "../../types";

interface AdminDashboardProps {
  orders: Order[];
  products: Product[];
  users: UserProfile[];
  conversations: ChatConversation[];
}

const paidStatuses = ["paid", "processing", "delivering", "delivered"];

export function AdminDashboard({ orders, products, users, conversations }: AdminDashboardProps) {
  const paidOrders = useMemo(() => orders.filter((order) => paidStatuses.includes(order.status)), [orders]);

  const revenueByPeriod = useMemo(
    () => ({
      today: paidOrders
        .filter((order) => isSamePeriod(order.createdAt, "today"))
        .reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      week: paidOrders
        .filter((order) => isSamePeriod(order.createdAt, "week"))
        .reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      month: paidOrders
        .filter((order) => isSamePeriod(order.createdAt, "month"))
        .reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      year: paidOrders
        .filter((order) => isSamePeriod(order.createdAt, "year"))
        .reduce((sum, order) => sum + (order.totalPrice || 0), 0)
    }),
    [paidOrders]
  );

  const chartDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const total = paidOrders
          .filter((order) => {
            const raw = order.createdAt as { toDate?: () => Date } | string | undefined;
            const orderDate = raw && typeof raw === "object" && raw.toDate ? raw.toDate() : new Date(String(raw));
            return !Number.isNaN(orderDate.getTime()) && orderDate.toDateString() === date.toDateString();
          })
          .reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        return { label: date.toLocaleDateString("pt-BR", { weekday: "short" }), total };
      }),
    [paidOrders]
  );

  const chartMax = useMemo(() => Math.max(...chartDays.map((day) => day.total), 1), [chartDays]);

  const onlineThreshold = Date.now() - 5 * 60 * 1000;
  const onlineUsers = users.filter((user) => {
    const raw = user.lastSeenAt as { toDate?: () => Date } | string | undefined;
    const date = raw && typeof raw === "object" && raw.toDate ? raw.toDate() : new Date(String(raw ?? ""));
    return !Number.isNaN(date.getTime()) && date.getTime() >= onlineThreshold;
  }).length;

  const productVisitCount = useMemo(
    () => products.reduce((sum, product) => sum + (product.visitCount ?? 0), 0),
    [products]
  );

  const cards = useMemo(
    () => [
      { label: "Vendas do dia", value: formatCurrency(revenueByPeriod.today), icon: CreditCard },
      { label: "Receita", value: formatCurrency(revenueByPeriod.month), icon: BarChart3 },
      { label: "Semana", value: formatCurrency(revenueByPeriod.week), icon: BarChart3 },
      { label: "Mes", value: formatCurrency(revenueByPeriod.month), icon: BarChart3 },
      { label: "Ano", value: formatCurrency(revenueByPeriod.year), icon: BarChart3 },
      { label: "Lucro estimado", value: formatCurrency(revenueByPeriod.month * 0.35), icon: CreditCard },
      { label: "Pendentes", value: orders.filter((order) => order.status === "pending_payment").length, icon: PackageCheck },
      { label: "Pagos", value: orders.filter((order) => order.status === "paid").length, icon: PackageCheck },
      { label: "Entregues", value: orders.filter((order) => order.status === "delivered").length, icon: PackageCheck },
      {
        label: "Cancelados",
        value: orders.filter((order) => ["cancelled", "payment_rejected"].includes(order.status)).length,
        icon: PackageCheck
      },
      { label: "Clientes online", value: onlineUsers, icon: Users },
      { label: "Conversas abertas", value: conversations.filter((item) => item.locked !== true).length, icon: MessageSquare },
      { label: "Novos usuarios", value: users.filter((user) => isSamePeriod(user.createdAt, "week")).length, icon: Users },
      { label: "Novas mensagens", value: conversations.reduce((sum, item) => sum + item.unreadAdminCount, 0), icon: MessageSquare }
    ],
    [conversations, onlineUsers, orders, revenueByPeriod, users]
  );

  const bestSellers = useMemo(
    () => [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 5),
    [products]
  );

  const mostVisited = useMemo(
    () => [...products].sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0)).slice(0, 5),
    [products]
  );

  const conversionRate = productVisitCount ? `${((paidOrders.length / productVisitCount) * 100).toFixed(2)}%` : "0%";

  return (
    <div className="dashboard-grid">
      <section className="metric-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="metric-card">
              <Icon size={20} aria-hidden />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="chart-panel">
        <h2>Vendas por dia</h2>
        <div className="bar-chart" aria-label="Vendas por dia">
          {chartDays.map((day) => (
            <span key={day.label} style={{ "--bar": `${Math.max(8, (day.total / chartMax) * 100)}%` } as CSSProperties}>
              <i />
              <small>{day.label}</small>
            </span>
          ))}
        </div>
      </section>

      <section className="chart-panel">
        <h2>Receita e conversao</h2>
        <div className="conversion-grid">
          <strong>{formatCurrency(revenueByPeriod.month)}</strong>
          <span>Receita mensal</span>
          <strong>{productVisitCount}</strong>
          <span>Visitas em produtos</span>
          <strong>{conversionRate}</strong>
          <span>Conversao estimada</span>
        </div>
      </section>

      <ProductRank title="Produtos mais vendidos" products={bestSellers} metric="soldCount" />
      <ProductRank title="Produtos mais visitados" products={mostVisited} metric="visitCount" />
    </div>
  );
}

function ProductRank({
  title,
  products,
  metric
}: {
  title: string;
  products: Product[];
  metric: "soldCount" | "visitCount";
}) {
  return (
    <section className="chart-panel">
      <h2>{title}</h2>
      {products.map((product) => (
        <div key={product.id} className="rank-row">
          <span>{product.name}</span>
          <strong>{product[metric] ?? 0}</strong>
        </div>
      ))}
    </section>
  );
}
