import { Platform } from "react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type Plan = "single" | "combo";

// Runs the purchase flow. In mock mode (no Razorpay keys configured on the
// server) or on web/Expo Go, it completes with a simulated payment. When the
// admin has configured live keys and the app is a native build, it opens the
// Razorpay checkout.
export async function purchase(plan: Plan, categoryId?: string): Promise<void> {
  const order = await api.post("/payments/orders", { plan, category_id: categoryId });

  if (order.mock || Platform.OS === "web") {
    await api.post("/payments/verify", {
      local_order_id: order.local_order_id,
      razorpay_payment_id: "mock_payment",
      razorpay_order_id: "mock_order",
      razorpay_signature: "mock",
    });
  } else {
    // Native-only module. Loaded indirectly so the bundler does not try to
    // resolve it on web / Expo Go (it requires a native dev build with keys).
    const moduleName = "react-native-razorpay";
    const RazorpayCheckout = (eval("require"))(moduleName).default;
    const result = await RazorpayCheckout.open({
      key: order.key_id,
      amount: String(order.amount),
      currency: order.currency,
      name: "DakMock",
      description: `${plan === "combo" ? "Combo" : "Single"} exam pass`,
      order_id: order.order_id,
      theme: { color: "#C8102E" },
    });
    await api.post("/payments/verify", {
      local_order_id: order.local_order_id,
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_order_id: result.razorpay_order_id,
      razorpay_signature: result.razorpay_signature,
    });
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
    queryClient.invalidateQueries({ queryKey: ["test-series"] }),
  ]);
}
