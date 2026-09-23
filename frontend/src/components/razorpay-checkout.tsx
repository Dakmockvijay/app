import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "phosphor-react-native";

import { verifyPayment, PaymentOrder } from "@/src/payments";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

type Prefill = { name?: string; email?: string; contact?: string };

type Props = {
  order: PaymentOrder;
  prefill?: Prefill;
  description: string;
  onSuccess: () => void;
  onCancel: (reason?: string) => void;
};

function jsonForScript(value: any) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildOptions(order: PaymentOrder, prefill: Prefill | undefined, description: string) {
  return {
    key: order.key_id,
    amount: String(order.amount),
    currency: order.currency,
    name: "DakMock",
    description,
    order_id: order.order_id,
    prefill: prefill || {},
    theme: { color: "#C8102E" },
    modal: { confirm_close: true, escape: false, backdropclose: false },
  };
}

function checkoutHtml(order: PaymentOrder, prefill: Prefill | undefined, description: string) {
  const config = jsonForScript(buildOptions(order, prefill, description));
  return `<!doctype html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>body{margin:0;font-family:-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F8F9FA}#pay{font-size:16px;padding:14px 28px;background:#C8102E;color:#fff;border:none;border-radius:12px;font-weight:700}</style>
</head><body>
  <button id="pay">Pay Now</button>
  <script>
    var cfg = ${config};
    function send(type, data){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:type}, data||{}))); } }
    var options = Object.assign({}, cfg, {
      handler: function(r){ send('success', { payment_id:r.razorpay_payment_id, order_id:r.razorpay_order_id, signature:r.razorpay_signature }); },
      modal: Object.assign({}, cfg.modal, { ondismiss: function(){ send('dismiss'); } })
    });
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(resp){ send('failed', { description: resp.error && resp.error.description }); });
    document.getElementById('pay').onclick = function(){ rzp.open(); };
    window.onload = function(){ setTimeout(function(){ rzp.open(); }, 150); };
  </script>
</body></html>`;
}

export function RazorpayCheckout({ order, prefill, description, onSuccess, onCancel }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const handled = useRef(false);
  const [verifying, setVerifying] = useState(false);

  const settle = useCallback(
    async (paymentId: string, orderId: string, signature: string) => {
      if (handled.current) return;
      handled.current = true;
      setVerifying(true);
      try {
        await verifyPayment({ localOrderId: order.local_order_id, paymentId, orderId, signature });
        onSuccess();
      } catch (e: any) {
        handled.current = false;
        onCancel(e?.message || "Payment verification failed");
      } finally {
        setVerifying(false);
      }
    },
    [order.local_order_id, onSuccess, onCancel],
  );

  // Web: inject Razorpay checkout.js and open in the current page.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    const open = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).Razorpay) return resolve();
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Razorpay"));
          document.body.appendChild(s);
        });
        if (cancelled) return;
        const options: any = {
          ...buildOptions(order, prefill, description),
          handler: (r: any) => settle(r.razorpay_payment_id, r.razorpay_order_id, r.razorpay_signature),
          modal: { ondismiss: () => onCancel() },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", (resp: any) => onCancel(resp?.error?.description));
        rzp.open();
      } catch (e: any) {
        onCancel(e?.message || "Could not open checkout");
      }
    };
    open();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const html = useMemo(() => checkoutHtml(order, prefill, description), [order, prefill, description]);

  const onMessage = useCallback(
    (event: any) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === "success") settle(msg.payment_id, msg.order_id, msg.signature);
      else if (msg.type === "dismiss") onCancel();
      else if (msg.type === "failed") onCancel(msg.description);
    },
    [settle, onCancel],
  );

  if (Platform.OS === "web") {
    // Checkout opens in an overlay injected by Razorpay; show a light backdrop.
    return (
      <Modal transparent animationType="fade">
        <View style={styles.webBackdrop}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.webText}>Opening secure Razorpay checkout…</Text>
          <Pressable testID="cancel-web-checkout" onPress={() => onCancel()} style={styles.webCancel}>
            <Text style={styles.webCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={() => onCancel()}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Secure Payment</Text>
          <Pressable testID="close-checkout" onPress={() => onCancel()} hitSlop={12}>
            <X size={24} color={colors.onSurface} />
          </Pressable>
        </View>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.brandPrimary} />}
          style={{ flex: 1 }}
        />
        {verifying && (
          <View style={styles.verifyOverlay}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={styles.verifyText}>Confirming payment…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  verifyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  verifyText: { color: colors.onSurface, fontWeight: "700", fontSize: fontSize.base },
  webBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,17,40,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  webText: { color: "#FFFFFF", fontWeight: "700", fontSize: fontSize.base },
  webCancel: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  webCancelText: { color: colors.onSurface, fontWeight: "800", fontSize: fontSize.base },
}));
