import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gift } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function AdminReferral() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get("/admin/settings") });

  const [enabled, setEnabled] = useState(true);
  const [perRef, setPerRef] = useState("1");
  const [tokenValue, setTokenValue] = useState("10");
  const [threshold, setThreshold] = useState("10");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.referral_enabled);
      setPerRef(String(settings.data.tokens_per_referral));
      setTokenValue(String(settings.data.token_value));
      setThreshold(String(settings.data.payout_threshold));
    }
  }, [settings.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/referral-config", {
        referral_enabled: enabled,
        tokens_per_referral: parseInt(perRef) || 0,
        token_value: parseInt(tokenValue) || 10,
        payout_threshold: parseInt(threshold) || 10,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["referral"] });
      toast.show("Referral settings saved", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  if (settings.isLoading) return <View style={styles.root}><ScreenHeader title="Referral Settings" /><Loading /></View>;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Referral Settings" subtitle="Control the reward system" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.hero}>
          <Gift size={30} color={colors.brandPrimary} weight="fill" />
          <Text style={styles.heroText}>
            Reward: 1 referred purchase = {perRef || 0} token(s). 1 token = ₹{tokenValue || 10}. Payout allowed at {threshold || 10} tokens (₹{(parseInt(threshold) || 0) * (parseInt(tokenValue) || 0)}).
          </Text>
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Pressable testID="ref-enabled" onPress={() => setEnabled((v) => !v)} style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Referral system</Text>
              <Text style={styles.hint}>{enabled ? "Enabled — users earn tokens" : "Disabled — no tokens awarded"}</Text>
            </View>
            <View style={[styles.switch, enabled && styles.switchOn]}><View style={[styles.knob, enabled && styles.knobOn]} /></View>
          </Pressable>
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Field label="Tokens per successful referral" value={perRef} onChangeText={setPerRef} keyboardType="number-pad" testID="per-ref" />
          <Field label="Value of 1 token (₹)" value={tokenValue} onChangeText={setTokenValue} keyboardType="number-pad" testID="token-value" />
          <Field label="Payout threshold (tokens)" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" testID="threshold" />
          <AppButton title="Save Referral Settings" onPress={save} loading={busy} testID="save-referral" />
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "600", lineHeight: 20 },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  switchRow: { flexDirection: "row", alignItems: "center" },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, padding: 3 },
  switchOn: { backgroundColor: colors.brandPrimary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
}));
