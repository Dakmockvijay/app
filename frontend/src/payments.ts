import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type Plan = "single" | "combo";

export type PaymentOrder = {
  mock: boolean;
  local_order_id: string;
  order_id?: string;
  amount: number;
  currency: string;
  key_id?: string | null;
};

// Creates a payment order on the backend. When the admin has NOT configured
// live Razorpay keys, the server returns `mock: true` and the app can settle
// instantly. When live keys are set, `mock: false` with a real Razorpay
// order_id + public key_id that the Razorpay Standard Checkout needs.
export async function createOrder(plan: Plan, categoryId?: string): Promise<PaymentOrder> {
  return api.post("/payments/orders", { plan, category_id: categoryId });
}

// Verifies a payment on the backend. For mock orders the razorpay_* fields are
// placeholders; for live orders they come from the Razorpay Checkout handler.
export async function verifyPayment(args: {
  localOrderId: string;
  paymentId?: string;
  orderId?: string;
  signature?: string;
}): Promise<void> {
  await api.post("/payments/verify", {
    local_order_id: args.localOrderId,
    razorpay_payment_id: args.paymentId ?? "mock_payment",
    razorpay_order_id: args.orderId ?? "mock_order",
    razorpay_signature: args.signature ?? "mock",
  });
}

export async function invalidatePurchaseQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
    queryClient.invalidateQueries({ queryKey: ["test-series"] }),
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  ]);
}
