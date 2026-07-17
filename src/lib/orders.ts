export function orderConversationId(orderId: string) {
  return `order_${orderId}`;
}

export function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    cancelled: "Cancelado",
    delivered: "Entregue",
    delivering: "Em entrega",
    paid: "Pagamento aprovado",
    payment_pending: "Pagamento pendente",
    payment_rejected: "Pagamento recusado",
    pending_payment: "Aguardando pagamento",
    processing: "Em processamento"
  };

  return labels[status] || status;
}

export function isOrderDelivered(status: string) {
  return status === "delivered";
}

export function isOrderChatAvailable(status: string) {
  return !["cancelled", "payment_rejected"].includes(status);
}
