export function formatDate(value: unknown) {
  if (!value) return "Não informado";

  const date =
    typeof value === "object" && value && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function isSamePeriod(value: unknown, period: "today" | "week" | "month" | "year") {
  const date =
    typeof value === "object" && value && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));

  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  if (period === "today") return date.toDateString() === now.toDateString();
  if (period === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (period === "year") return date.getFullYear() === now.getFullYear();

  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return date >= weekAgo;
}
