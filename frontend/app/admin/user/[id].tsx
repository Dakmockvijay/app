import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShieldCheck, Coins, CalendarCheck, Plus, XCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminUserDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const user = useQuery({ queryKey: ["admin-user", id], queryFn: () => api.get(`/admin/users/${id}`) });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });

  const [tokens, setTokens] = useState("");
  const [plan, setPlan] = useState<"single" | "combo">("combo");
  const [catId, setCatId] = useState("gds_mts");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user.data) setTokens(String(user.data.token_balance ?? 0));
  }, [user.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const saveTokens = async () => {
    setBusy("tokens");
    try {
      await api.put(`/admin/users/${id}`, { token_balance: parseInt(tokens) || 0 });
      refresh();
      toast.show("Tokens updated", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(null); }
  };

  const toggleAdmin = async () => {
    setBusy("admin");
    try {
      await api.put(`/admin/users/${id}`, { is_admin: !user.data.is_admin });
      refresh();
      toast.show("Role updated", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(null); }
  };

  const grant = async () => {
    setBusy("grant");
    try {
      await api.post(`/admin/users/${id}/grant-subscription`, { plan, category_id: plan === "single" ? catId : null, days: 365 });
      refresh();
      toast.show("Subscription granted (1 year)", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(null); }
  };

  const revoke = async (subId: string) => {
    try {
      await api.post(`/admin/users/${id}/revoke-subscription?subscription_id=${subId}`);
      refresh();
      toast.show("Subscription revoked", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  if (user.isLoading || !user.data) return <View style={styles.root}><ScreenHeader title="User" /><Loading /></View>;
  const u = user.data;

  return (
    <View style={styles.root}>
      <ScreenHeader title={u.name} subtitle={u.email} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
        <Card style={styles.infoRow}>
          <Info label="Referral Code" value={u.referral_code} />
          <Info label="Attempts" value={String(u.attempts ?? "—")} />
          <Info label="Role" value={u.is_admin ? "Admin" : "Student"} />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.headingRow}><Coins size={20} color={colors.brandSecondary} weight="fill" /><Text style={styles.heading}>Token Balance</Text></View>
          <Field label="Tokens" value={tokens} onChangeText={setTokens} keyboardType="number-pad" testID="user-tokens" />
          <AppButton title="Update Tokens" variant="outline" onPress={saveTokens} loading={busy === "tokens"} testID="save-tokens" />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.headingRow}><ShieldCheck size={20} color={colors.brandPrimary} weight="fill" /><Text style={styles.heading}>Admin Access</Text></View>
          <Pressable testID="toggle-admin" onPress={toggleAdmin} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{u.is_admin ? "This user is an admin" : "Make this user an admin"}</Text>
            <View style={[styles.switch, u.is_admin && styles.switchOn]}><View style={[styles.knob, u.is_admin && styles.knobOn]} /></View>
          </Pressable>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.headingRow}><CalendarCheck size={20} color={colors.success} weight="fill" /><Text style={styles.heading}>Active Subscriptions</Text></View>
          {(u.subscriptions || []).length === 0 ? (
            <Text style={styles.muted}>No active subscriptions.</Text>
          ) : (
            (u.subscriptions || []).map((s: any) => (
              <View key={s.subscription_id} style={styles.subRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subTitle}>{s.plan === "combo" ? "Combo (All)" : s.category_name}</Text>
                  <Text style={styles.subDate}>till {new Date(s.active_until).toLocaleDateString()}</Text>
                </View>
                <Pressable testID={`revoke-${s.subscription_id}`} onPress={() => revoke(s.subscription_id)} style={styles.revokeBtn}>
                  <XCircle size={16} color={colors.error} weight="fill" /><Text style={styles.revokeText}>Revoke</Text>
                </Pressable>
              </View>
            ))
          )}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.headingRow}><Plus size={20} color={colors.brandPrimary} weight="bold" /><Text style={styles.heading}>Grant Subscription</Text></View>
          <View style={styles.planRow}>
            {(["combo", "single"] as const).map((p) => (
              <Pressable key={p} testID={`plan-${p}`} onPress={() => setPlan(p)} style={[styles.planChip, plan === p && styles.planActive]}>
                <Text style={[styles.planText, plan === p && styles.planTextActive]}>{p === "combo" ? "Combo (All)" : "Single Category"}</Text>
              </Pressable>
            ))}
          </View>
          {plan === "single" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {(cats.data || []).map((c: any) => (
                <Pressable key={c.category_id} testID={`grant-cat-${c.category_id}`} onPress={() => setCatId(c.category_id)} style={[styles.catChip, catId === c.category_id && styles.catActive]}>
                  <Text style={[styles.catText, catId === c.category_id && styles.catTextActive]}>{c.short}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <AppButton title="Grant 1-Year Access" onPress={grant} loading={busy === "grant"} testID="grant-sub" />
        </Card>
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.info}>
      <Text style={styles.infoVal}>{value}</Text>
      <Text style={styles.infoLbl}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  info: { alignItems: "center", flex: 1 },
  infoVal: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary },
  infoLbl: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  muted: { color: colors.muted, fontSize: fontSize.base },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  switchLabel: { flex: 1, fontSize: fontSize.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, padding: 3 },
  switchOn: { backgroundColor: colors.brandPrimary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  subRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  subTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  subDate: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  revokeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.error },
  revokeText: { color: colors.error, fontWeight: "700", fontSize: fontSize.sm },
  planRow: { flexDirection: "row", gap: spacing.sm },
  planChip: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  planActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  planText: { fontWeight: "700", color: colors.muted, fontSize: fontSize.sm },
  planTextActive: { color: colors.brandPrimary },
  catRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  catChip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  catActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  catText: { fontWeight: "700", color: colors.onSurfaceSecondary, fontSize: fontSize.base },
  catTextActive: { color: colors.onBrandPrimary },
}));
