import { BarChart3, CreditCard, MessageSquare, PackageCheck, Users } from "lucide-react";
import type { CSSProperties } from "react";
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
  const paidOrders = orders.filter((order) => paidStatuses.includes(order.status));
  const revenue = (period: "today" | "week" | "month" | "year") =>
    paidOrders
      .filter((order) => isSamePeriod(order.createdAt, period))
      .reduce((sum, order) => sum + (order.totalPrice || 0), 0);
  const monthRevenue = revenue("month");
  const chartDays = Array.from({ length: 7 }, (_, index) => {
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
  });
  const chartMax = Math.max(...chartDays.map((day) => day.total), 1);

  const cards = [
    { label: "Hoje", value: formatCurrency(revenue("today")), icon: CreditCard },
    { label: "Semana", value: formatCurrency(revenue("week")), icon: BarChart3 },
    { label: "Mês", value: formatCurrency(monthRevenue), icon: BarChart3 },
    { label: "Ano", value: formatCurrency(revenue("year")), icon: BarChart3 },
    { label: "Lucro estimado", value: formatCurrency(monthRevenue * 0.35), icon: CreditCard },
    { label: "Pendentes", value: orders.filter((order) => order.status === "pending_payment").length, icon: PackageCheck },
    { label: "Pagos", value: orders.filter((order) => order.status === "paid").length, icon: PackageCheck },
    { label: "Entregues", value: orders.filter((order) => order.status === "delivered").length, icon: PackageCheck },
    { label: "Cancelados", value: orders.filter((order) => ["cancelled", "payment_rejected"].includes(order.status)).length, icon: PackageCheck },
    { label: "Novos usuários", value: users.filter((user) => isSamePeriod(user.createdAt, "week")).length, icon: Users },
    { label: "Novas mensagens", value: conversations.reduce((sum, item) => sum + item.unreadAdminCount, 0), icon: MessageSquare }
  ];

  const bestSellers = [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 5);
  const mostVisited = [...products].sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0)).slice(0, 5);

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
        <h2>Receita e conversão</h2>
        <div className="conversion-grid">
          <strong>{formatCurrency(monthRevenue)}</strong>
          <span>Receita mensal</span>
          <strong>{products.reduce((sum, product) => sum + (product.visitCount ?? 0), 0)}</strong>
          <span>Visitas em produtos</span>
          <strong>
            {products.reduce((sum, product) => sum + (product.visitCount ?? 0), 0)
              ? `${(
                  (paidOrders.length /
                    products.reduce((sum, product) => sum + (product.visitCount ?? 0), 0)) *
                  100
                ).toFixed(2)}%`
              : "0%"}
          </strong>
          <span>Conversão estimada</span>
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
