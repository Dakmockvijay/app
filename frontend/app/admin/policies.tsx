import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading } from "@/src/components/ui";
import { makeStyles, spacing, fontSize } from "@/src/theme";

export default function AdminPolicies() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const policies = useQuery({ queryKey: ["policies"], queryFn: () => api.get("/policies") });

  const [terms, setTerms] = useState("");
  const [refund, setRefund] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (policies.data) {
      setTerms(policies.data.terms || "");
      setRefund(policies.data.refund || "");
      setPrivacy(policies.data.privacy || "");
    }
  }, [policies.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/policies", { terms, refund, privacy });
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.show("Policies updated", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  if (policies.isLoading) return <View style={styles.root}><ScreenHeader title="Policy Pages" /><Loading /></View>;

  const area = { minHeight: 130, textAlignVertical: "top" as const, paddingTop: spacing.md };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Policy Pages" subtitle="Razorpay compliance content" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <Card><Text style={styles.hint}>These texts appear to students under Profile → Legal, and are required for Razorpay onboarding.</Text></Card>
        <Card><Field label="Terms & Conditions" value={terms} onChangeText={setTerms} multiline style={area} testID="pol-terms" /></Card>
        <Card><Field label="Refund / Cancellation Policy" value={refund} onChangeText={setRefund} multiline style={area} testID="pol-refund" /></Card>
        <Card><Field label="Privacy Policy" value={privacy} onChangeText={setPrivacy} multiline style={area} testID="pol-privacy" /></Card>
        <AppButton title="Save Policies" onPress={save} loading={busy} testID="save-policies" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hint: { color: colors.muted, fontSize: fontSize.base, lineHeight: 20 },
}));
