import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretRight, Lock, LockOpen, X, CheckCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { createOrder, verifyPayment, invalidatePurchaseQueries, PaymentOrder, Plan } from "@/src/payments";
import { RazorpayCheckout } from "@/src/components/razorpay-checkout";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { useToast } from "@/src/toast";
import { AppButton, Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function Explore() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ category?: string }>();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [selected, setSelected] = useState<string>(params.category || "all");
  const [modalCat, setModalCat] = useState<{ id: string; name: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<PaymentOrder | null>(null);
  const [livePlan, setLivePlan] = useState<Plan>("combo");

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const series = useQuery({ queryKey: ["test-series"], queryFn: () => api.get("/test-series"), refetchInterval: 10000 });
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api.get("/pricing") });

  const filtered = useMemo(() => {
    const all: any[] = series.data || [];
    if (selected === "all") return all;
    return all.filter((s) => s.category_id === selected);
  }, [series.data, selected]);

  const chips = [{ category_id: "all", short: "All", name: "All Exams" }, ...(cats.data || [])];

  const purchaseSuccess = (plan: Plan) => {
    setModalCat(null);
    toast.show(plan === "combo" ? "Combo Pass activated! 🎉" : "Pass activated! 🎉", "success");
    series.refetch();
  };

  const doPurchase = async (plan: Plan, categoryId?: string) => {
    setBusyPlan(plan);
    try {
      const order = await createOrder(plan, categoryId);
      if (order.mock) {
        await verifyPayment({ localOrderId: order.local_order_id });
        await invalidatePurchaseQueries();
        purchaseSuccess(plan);
      } else {
        // Live keys configured: open Razorpay Standard Checkout.
        setModalCat(null);
        setLivePlan(plan);
        setLiveOrder(order);
      }
    } catch (e: any) {
      toast.show(e.message || "Payment failed", "error");
    } finally {
      setBusyPlan(null);
    }
  };

  if (series.isLoading || cats.isLoading) return <Loading label="Loading test series…" />;

  return (
    <View style={styles.root}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Test Series</Text>
        <Text style={styles.subtitle}>
          Single ₹{pricing.data?.single_price ?? 149} · Combo ₹{pricing.data?.combo_price ?? 249} · 1-Year access
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {chips.map((c: any) => {
            const active = selected === c.category_id;
            return (
              <Pressable
                key={c.category_id}
                testID={`filter-${c.category_id}`}
                onPress={() => setSelected(c.category_id)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                  {c.short}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.series_id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: bottomChrome + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>No test series in this category yet.</Text>}
        renderItem={({ item }) => {
          const cat = (cats.data || []).find((c: any) => c.category_id === item.category_id);
          return (
            <Pressable
              testID={`series-card-${item.series_id}`}
              onPress={() => {
                if (item.purchased) router.push(`/series/${item.series_id}`);
                else setModalCat({ id: item.category_id, name: cat?.name || "Exam" });
              }}
            >
              <Card>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.seriesTitle}>{item.title}</Text>
                    <Text style={styles.seriesDesc} numberOfLines={2}>{item.description}</Text>
                  </View>
                  {item.is_free ? (
                    <Badge label="FREE" color={colors.onSuccess} bg={colors.success} />
                  ) : item.purchased ? (
                    <LockOpen size={22} color={colors.success} weight="fill" />
                  ) : (
                    <Lock size={22} color={colors.muted} weight="fill" />
                  )}
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.metaText}>{item.test_count} tests · {cat?.short}</Text>
                  {item.purchased || item.is_free ? (
                    <View style={styles.startRow}>
                      <Text style={styles.startText}>Open</Text>
                      <CaretRight size={16} color={colors.brandPrimary} weight="bold" />
                    </View>
                  ) : (
                    <View style={styles.unlockRow}>
                      <Text style={styles.unlockText}>Unlock</Text>
                      <CaretRight size={16} color={colors.onBrandPrimary} weight="bold" />
                    </View>
                  )}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      {/* Plan modal */}
      <Modal visible={!!modalCat} transparent animationType="slide" onRequestClose={() => setModalCat(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose your pass</Text>
              <Pressable testID="close-plan-modal" onPress={() => setModalCat(null)} hitSlop={12}>
                <X size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>Single Category</Text>
                <Text style={styles.planPrice}>₹{pricing.data?.single_price ?? 149}</Text>
              </View>
              <Text style={styles.planLine}>{modalCat?.name} · full mock series</Text>
              <Text style={styles.planLine}>1-Year validity · All-India rank</Text>
              <AppButton
                title={`Buy ${modalCat?.name} — ₹${pricing.data?.single_price ?? 149}`}
                onPress={() => doPurchase("single", modalCat?.id)}
                loading={busyPlan === "single"}
                testID="buy-single"
                style={{ marginTop: spacing.md }}
              />
            </View>

            <View style={[styles.planCard, styles.planCombo]}>
              <View style={styles.planHeader}>
                <Text style={styles.planNameCombo}>Combo Pass — All Exams</Text>
                <Text style={styles.planPriceCombo}>₹{pricing.data?.combo_price ?? 249}</Text>
              </View>
              {["All 3 exam tiers unlocked", "Best value for money", "1-Year validity + rankings"].map((l) => (
                <View key={l} style={styles.comboLine}>
                  <CheckCircle size={16} color={colors.brandSecondary} weight="fill" />
                  <Text style={styles.comboLineText}>{l}</Text>
                </View>
              ))}
              <AppButton
                title={`Get Combo Pass — ₹${pricing.data?.combo_price ?? 249}`}
                variant="secondary"
                onPress={() => doPurchase("combo")}
                loading={busyPlan === "combo"}
                testID="buy-combo"
                style={{ marginTop: spacing.md }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {liveOrder && (
        <RazorpayCheckout
          order={liveOrder}
          description={livePlan === "combo" ? "DakMock Combo Pass" : "DakMock Single Category Pass"}
          prefill={{ name: user?.name, email: user?.email }}
          onSuccess={async () => {
            setLiveOrder(null);
            await invalidatePurchaseQueries();
            purchaseSuccess(livePlan);
          }}
          onCancel={(reason) => {
            setLiveOrder(null);
            toast.show(reason || "Payment cancelled", reason ? "error" : "info");
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "900", color: colors.onSurface },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, fontWeight: "600" },
  chipScroll: { marginTop: spacing.md, marginHorizontal: -spacing.xl },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, height: 56, alignItems: "center" },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    justifyContent: "center",
    borderWidth: 1.5,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipInactive: { backgroundColor: colors.surface, borderColor: colors.border },
  chipText: { fontSize: fontSize.base, fontWeight: "700" },
  chipTextActive: { color: colors.onBrandPrimary },
  chipTextInactive: { color: colors.onSurfaceSecondary },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  seriesTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  seriesDesc: { fontSize: fontSize.base, color: colors.muted, marginTop: 4 },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  metaText: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  startRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  startText: { color: colors.brandPrimary, fontWeight: "800", fontSize: fontSize.base },
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  unlockText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.sm },
  modalOverlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  planCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planCombo: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  planNameCombo: { fontSize: fontSize.lg, fontWeight: "800", color: "#FFFFFF" },
  planPrice: { fontSize: fontSize.xl, fontWeight: "900", color: colors.brandPrimary },
  planPriceCombo: { fontSize: fontSize.xl, fontWeight: "900", color: colors.brandSecondary },
  planLine: { fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginTop: 4 },
  comboLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  comboLineText: { color: "#E2E8F0", fontSize: fontSize.base },
}));
