export type OrderReadiness = {
  payment_status: string;
  deposit_due_cents: number | null;
  final_total_cents: number | null;
  balance_due_cents: number | null;
  balance_paid_at: string | null;
  ready_at: string | null;
  fulfilled_at: string | null;
};

// Presentation only. The authenticated order_operation RPC still authorizes every handover.
export function paymentCleared(order: OrderReadiness) {
  const {deposit_due_cents: deposit, final_total_cents: total, balance_due_cents: balance} = order;
  return order.payment_status === 'VERIFIED' && deposit != null && total != null && balance != null
    && deposit >= 0 && balance >= 0 && total === deposit + balance
    && (balance === 0 || !!order.balance_paid_at);
}

export function readyForHandover(order: OrderReadiness) {
  return paymentCleared(order) && !!order.ready_at && !order.fulfilled_at;
}

export function orderStatus(order: OrderReadiness) {
  if (order.payment_status === 'REFUNDED') return {label: 'Refunded', tone: 'neutral'};
  if (order.fulfilled_at) return {label: 'Completed', tone: 'neutral'};
  if (readyForHandover(order)) return {label: 'Ready for handover', tone: 'success'};
  if (order.payment_status === 'PENDING_PAYNOW') return {label: 'Deposit pending', tone: 'warning'};
  if (paymentCleared(order)) return {label: 'Paid · awaiting readiness', tone: 'success'};
  return {label: 'Payment review', tone: 'warning'};
}

export const money = (cents: number | null) => cents == null ? 'Not set' : `S$${(cents / 100).toFixed(2)}`;
export const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('en-SG', {timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short'}) : '—';
