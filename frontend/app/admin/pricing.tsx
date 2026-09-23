import React, { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function AdminPricing() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get("/admin/settings") });

  const [single, setSingle] = useState("");
  const [combo, setCombo] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [rzEnabled, setRzEnabled] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setSingle(String(settings.data.single_price));
      setCombo(String(settings.data.combo_price));
      setSupportEmail(settings.data.support_email || "");
      setRzEnabled(settings.data.razorpay?.enabled || false);
      setKeyId(settings.data.razorpay?.key_id || "");
    }
  }, [settings.data]);

  const savePricing = async () => {
    setBusy("pricing");
    try {
      await api.put("/admin/pricing", { single_price: parseInt(single) || 149, combo_price: parseInt(combo) || 249 });
      queryClient.invalidateQueries({ queryKey: ["pricing"] });
      toast.show("Pricing updated", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const saveRazorpay = async () => {
    setBusy("razorpay");
    try {
      await api.put("/admin/razorpay", { enabled: rzEnabled, key_id: keyId.trim(), key_secret: keySecret.trim(), mode: "test" });
      toast.show("Razorpay settings saved", "success");
      setKeySecret("");
      settings.refetch();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const saveSupport = async () => {
    setBusy("support");
    try {
      await api.put("/admin/support-config", { support_email: supportEmail.trim() });
      toast.show("Support email updated", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (settings.isLoading) return <View style={styles.root}><ScreenHeader title="Pricing & Gateway" /><Loading /></View>;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Pricing & Gateway" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ gap: spacing.xs }}>
          <Text style={styles.heading}>Subscription Pricing (₹)</Text>
          <Field label="Single Category Price" keyboardType="number-pad" value={single} onChangeText={setSingle} testID="price-single" />
          <Field label="Combo Pass Price" keyboardType="number-pad" value={combo} onChangeText={setCombo} testID="price-combo" />
          <AppButton title="Save Pricing" onPress={savePricing} loading={busy === "pricing"} testID="save-pricing" />
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Razorpay Gateway</Text>
              <Text style={styles.hint}>
                {settings.data?.razorpay?.key_secret_set ? "Secret is set" : "No secret saved — running in mock mode"}
              </Text>
            </View>
            <Switch value={rzEnabled} onValueChange={setRzEnabled} testID="razorpay-enabled" trackColor={{ true: colors.brandPrimary }} />
          </View>
          <Field label="Key ID" autoCapitalize="none" placeholder="rzp_test_xxxxx" value={keyId} onChangeText={setKeyId} testID="rzp-key-id" />
          <Field label="Key Secret" autoCapitalize="none" placeholder="Enter to update" value={keySecret} onChangeText={setKeySecret} secureTextEntry testID="rzp-key-secret" />
          <AppButton title="Save Gateway Settings" variant="outline" onPress={saveRazorpay} loading={busy === "razorpay"} testID="save-razorpay" />
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Text style={styles.heading}>Support Email</Text>
          <Field label="Support Email Address" autoCapitalize="none" keyboardType="email-address" value={supportEmail} onChangeText={setSupportEmail} testID="support-email-input" />
          <AppButton title="Save Support Email" variant="outline" onPress={saveSupport} loading={busy === "support"} testID="save-support" />
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center" },
}));
