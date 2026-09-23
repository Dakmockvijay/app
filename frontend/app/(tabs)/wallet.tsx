import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Share, Text, View, RefreshControl } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, ShareNetwork, Coins, X } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { usesNativeTabs } from "@/src/navigation";
import { useToast } from "@/src/toast";
import { AppButton, Card, Field, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

const WALLET_IMG =
  "https://images.pexels.com/photos/8515596/pexels-photo-8515596.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const METHODS = [
  { key: "upi", label: "UPI ID" },
  { key: "paytm", label: "Paytm" },
  { key: "gpay", label: "GPay" },
];

export default function Wallet() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const ref = useQuery({ queryKey: ["referral"], queryFn: () => api.get("/referral") });
  const payouts = useQuery({ queryKey: ["payout-requests"], queryFn: () => api.get("/payout-requests") });

  const [showClaim, setShowClaim] = useState(false);
  const [method, setMethod] = useState("upi");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);

  if (ref.isLoading) return <Loading label="Loading wallet…" />;

  const data = ref.data || {};
  const balance = data.token_balance ?? 0;
  const threshold = data.payout_threshold ?? 10;
  const value = data.token_value ?? 10;
  const canClaim = balance >= threshold;
  const referrals: any[] = data.referrals || [];

  const copyCode = async () => {
    await Clipboard.setStringAsync(data.referral_code);
    toast.show("Referral code copied!", "success");
  };
  const shareCode = async () => {
    try {
      await Share.share({
        message: `Join me on DakMock — India Post exam prep! Use my referral code ${data.referral_code} when you sign up. https://dakmock.com`,
      });
    } catch {}
  };

  const claim = async () => {
    if (!account.trim()) {
      toast.show("Enter your payout account", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/payout-requests", { method, account: account.trim() });
      toast.show(`Payout request of ₹${res.amount} submitted`, "success");
      setShowClaim(false);
      setAccount("");
      queryClient.invalidateQueries({ queryKey: ["referral"] });
      queryClient.invalidateQueries({ queryKey: ["payout-requests"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (e: any) {
      toast.show(e.message || "Request failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={ref.isFetching && !ref.isLoading} onRefresh={() => { ref.refetch(); payouts.refetch(); }} tintColor={colors.brandPrimary} />
        }
      >
        <View style={[styles.banner, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.bannerLabel}>Token Balance</Text>
          <View style={styles.balanceRow}>
            <Coins size={34} color={colors.brandSecondary} weight="fill" />
            <Text style={styles.balance}>{balance}</Text>
            <Text style={styles.tokenWord}>tokens</Text>
          </View>
          <Text style={styles.worth}>Worth ₹{balance * value} · 1 token = ₹{value}</Text>
          <AppButton
            title={canClaim ? `Claim Payout (₹${balance * value})` : `Reach ${threshold} tokens to claim`}
            variant="secondary"
            onPress={() => setShowClaim(true)}
            disabled={!canClaim}
            testID="open-claim"
            style={{ marginTop: spacing.lg }}
          />
        </View>

        <View style={styles.body}>
          <Card>
            <Text style={styles.cardHeading}>Your Referral Code</Text>
            <Text style={styles.cardHint}>
              Friends who sign up with your code and buy any pass earn you 1 token (₹{value}).
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} testID="referral-code">{data.referral_code}</Text>
              <View style={styles.codeActions}>
                <Pressable testID="copy-code" onPress={copyCode} style={styles.iconBtn}>
                  <Copy size={20} color={colors.brandPrimary} weight="bold" />
                </Pressable>
                <Pressable testID="share-code" onPress={shareCode} style={styles.iconBtn}>
                  <ShareNetwork size={20} color={colors.brandPrimary} weight="bold" />
                </Pressable>
              </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Referrals ({referrals.length})</Text>
          {referrals.length === 0 ? (
            <Card style={{ alignItems: "center", gap: spacing.md }}>
              <Image source={{ uri: WALLET_IMG }} style={styles.emptyImg} contentFit="cover" />
              <Text style={styles.emptyText}>No referrals yet. Share your code to start earning!</Text>
            </Card>
          ) : (
            referrals.map((r) => (
              <Card key={r.referral_id} style={styles.refRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.refName}>{r.referred_name || "New user"}</Text>
                  <Text style={styles.refDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
                </View>
                <Badge label={`+${r.tokens_awarded} token`} color={colors.onSuccess} bg={colors.success} />
              </Card>
            ))
          )}

          {(payouts.data || []).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Payout History</Text>
              {(payouts.data || []).map((p: any) => (
                <Card key={p.payout_id} style={styles.refRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.refName}>₹{p.amount} · {p.method.toUpperCase()}</Text>
                    <Text style={styles.refDate}>{p.account}</Text>
                  </View>
                  {p.status === "paid" ? (
                    <Badge label="Paid" color={colors.onSuccess} bg={colors.success} />
                  ) : p.status === "rejected" ? (
                    <Badge label="Rejected" color={colors.onError} bg={colors.error} />
                  ) : (
                    <Badge label="Pending" color={colors.onWarning} bg={colors.warning} />
                  )}
                </Card>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={showClaim} transparent animationType="slide" onRequestClose={() => setShowClaim(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Claim Payout</Text>
              <Pressable testID="close-claim" onPress={() => setShowClaim(false)} hitSlop={12}>
                <X size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.cardHint}>You will receive ₹{balance * value} for {balance} tokens.</Text>
            <View style={styles.methodRow}>
              {METHODS.map((m) => (
                <Pressable
                  key={m.key}
                  testID={`method-${m.key}`}
                  onPress={() => setMethod(m.key)}
                  style={[styles.methodChip, method === m.key && styles.methodActive]}
                >
                  <Text style={[styles.methodText, method === m.key && styles.methodTextActive]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <Field
              label={`${METHODS.find((m) => m.key === method)?.label} details`}
              placeholder={method === "upi" ? "name@bank" : "Registered number / ID"}
              value={account}
              onChangeText={setAccount}
              autoCapitalize="none"
              testID="input-account"
            />
            <AppButton title="Submit Request" onPress={claim} loading={busy} testID="submit-claim" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  banner: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  bannerLabel: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700" },
  balanceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.sm },
  balance: { color: "#FFFFFF", fontSize: 48, fontWeight: "900" },
  tokenWord: { color: "#CBD5E1", fontSize: fontSize.lg, fontWeight: "700" },
  worth: { color: "#CBD5E1", fontSize: fontSize.base, marginTop: 2 },
  body: { padding: spacing.xl, gap: spacing.md },
  cardHeading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  cardHint: { fontSize: fontSize.base, color: colors.muted, marginTop: 4 },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  code: { fontSize: fontSize.xl, fontWeight: "900", color: colors.brandPrimary, letterSpacing: 2 },
  codeActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  emptyImg: { width: 120, height: 120, borderRadius: radius.md },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: fontSize.base },
  refRow: { flexDirection: "row", alignItems: "center" },
  refName: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  refDate: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  methodRow: { flexDirection: "row", gap: spacing.sm },
  methodChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  methodActive: { borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  methodText: { fontWeight: "700", color: colors.muted, fontSize: fontSize.base },
  methodTextActive: { color: colors.brandPrimary },
}));
