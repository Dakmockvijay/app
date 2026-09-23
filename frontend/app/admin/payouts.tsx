import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, XCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminPayouts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const payouts = useQuery({ queryKey: ["admin-payouts"], queryFn: () => api.get("/admin/payout-requests") });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id + action);
    try {
      await api.post(`/admin/payout-requests/${id}/action?action=${action}`);
      toast.show(action === "approve" ? "Marked as paid" : "Rejected & tokens refunded", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Payout Requests" />
      {payouts.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={payouts.data || []}
          keyExtractor={(p: any) => p.payout_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>No payout requests yet.</Text>}
          renderItem={({ item }) => (
            <Card style={{ gap: spacing.md }}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amount}>₹{item.amount}</Text>
                  <Text style={styles.name}>{item.user_name} · {item.tokens} tokens</Text>
                </View>
                {item.status === "paid" ? (
                  <Badge label="Paid" color={colors.onSuccess} bg={colors.success} />
                ) : item.status === "rejected" ? (
                  <Badge label="Rejected" color={colors.onError} bg={colors.error} />
                ) : (
                  <Badge label="Pending" color={colors.onWarning} bg={colors.warning} />
                )}
              </View>
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>{item.method.toUpperCase()}</Text>
                <Text style={styles.detailVal} selectable>{item.account}</Text>
              </View>
              {item.status === "pending" && (
                <View style={styles.actions}>
                  <Pressable testID={`reject-${item.payout_id}`} onPress={() => act(item.payout_id, "reject")} style={styles.rejectBtn}>
                    <XCircle size={18} color={colors.error} weight="fill" />
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                  <Pressable testID={`approve-${item.payout_id}`} onPress={() => act(item.payout_id, "approve")} style={styles.approveBtn}>
                    <CheckCircle size={18} color={colors.onSuccess} weight="fill" />
                    <Text style={styles.approveText}>{busy === item.payout_id + "approve" ? "…" : "Approve & Mark Paid"}</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  rowTop: { flexDirection: "row", alignItems: "center" },
  amount: { fontSize: fontSize.xxl, fontWeight: "900", color: colors.brandPrimary },
  name: { fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  detailBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md },
  detailLabel: { fontSize: fontSize.sm, fontWeight: "800", color: colors.info },
  detailVal: { fontSize: fontSize.base, color: colors.onSurface, fontWeight: "700", marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.md },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  rejectText: { color: colors.error, fontWeight: "800", fontSize: fontSize.base },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.success,
  },
  approveText: { color: colors.onSuccess, fontWeight: "800", fontSize: fontSize.base },
}));
