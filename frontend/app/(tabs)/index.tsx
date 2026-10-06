import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable, RefreshControl, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretRight, Clock, Trophy, Fire, Megaphone, X } from "phosphor-react-native";

import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

function daysLeft(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, d);
}

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: () => api.get("/subscriptions"), refetchInterval: 10000 });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });
  const series = useQuery({ queryKey: ["test-series"], queryFn: () => api.get("/test-series"), refetchInterval: 10000 });
  const attempts = useQuery({ queryKey: ["attempts"], queryFn: () => api.get("/attempts"), refetchInterval: 15000 });
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: () => api.get("/analytics"), refetchInterval: 20000 });
  const announcement = useQuery({ queryKey: ["announcement"], queryFn: () => api.get("/announcements/active"), refetchInterval: 20000 });

  const [showAnn, setShowAnn] = useState(false);

  useEffect(() => {
    const a = announcement.data;
    if (!a) return;
    (async () => {
      const seen = await storage.getItem<string | null>("dakmock_seen_announcement", null);
      if (seen !== a.announcement_id) setShowAnn(true);
    })();
  }, [announcement.data]);

  const dismissAnn = async () => {
    if (announcement.data) await storage.setItem("dakmock_seen_announcement", announcement.data.announcement_id);
    setShowAnn(false);
  };

  const loading = subs.isLoading || cats.isLoading || series.isLoading;
  const refreshing = subs.isFetching && !subs.isLoading;

  const onRefresh = () => {
    subs.refetch();
    series.refetch();
    attempts.refetch();
    analytics.refetch();
  };

  if (loading) return <Loading label="Loading your dashboard…" />;

  const activeSubs: any[] = subs.data || [];
  const freeSeries: any[] = (series.data || []).filter((s: any) => s.is_free);
  const recentAttempts: any[] = (attempts.data || []).slice(0, 6);
  const streak = analytics.data?.streak || { current: 0 };
  const today = analytics.data?.today || { count: 0, goal: 3 };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {/* Navy header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.greeting}>Namaste 🙏</Text>
          <Text style={styles.name}>{user?.name || "Aspirant"}</Text>

          <View style={styles.passCard}>
            {activeSubs.length > 0 ? (
              <>
                <View style={styles.passRow}>
                  <Trophy size={22} color={colors.brandSecondary} weight="fill" />
                  <Text style={styles.passTitle}>
                    {activeSubs.some((s) => s.plan === "combo") ? "Combo Pass Active" : "Pass Active"}
                  </Text>
                </View>
                <Text style={styles.passSub}>
                  {activeSubs[0].category_name} • {daysLeft(activeSubs[0].active_until)} days left
                </Text>
              </>
            ) : (
              <>
                <View style={styles.passRow}>
                  <Fire size={22} color={colors.brandSecondary} weight="fill" />
                  <Text style={styles.passTitle}>No active pass</Text>
                </View>
                <Pressable testID="header-explore-cta" onPress={() => router.push("/(tabs)/explore")}>
                  <Text style={styles.passLink}>Explore exam passes →</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={styles.body}>
          {/* Progress & streak */}
          <Pressable testID="home-progress" onPress={() => router.push("/progress")}>
            <Card style={styles.streakBanner}>
              <View style={styles.fireCircle}>
                <Fire size={24} color={colors.brandSecondary} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakBannerNum}>{streak.current}-day streak</Text>
                <Text style={styles.streakBannerSub}>
                  {today.count}/{today.goal} tests today · tap for insights
                </Text>
              </View>
              <CaretRight size={20} color={colors.muted} />
            </Card>
          </Pressable>

          {/* Categories */}
          <Text style={styles.sectionTitle}>Exam Tiers</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {(cats.data || []).map((c: any) => (
              <Pressable
                key={c.category_id}
                testID={`cat-chip-${c.category_id}`}
                onPress={() => router.push(`/(tabs)/explore?category=${c.category_id}`)}
                style={styles.catCard}
              >
                <Text style={styles.catShort}>{c.short}</Text>
                <Text style={styles.catName}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Recent activity */}
          {recentAttempts.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Your Recent Tests</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {recentAttempts.map((a: any) => (
                  <Pressable
                    key={a.attempt_id}
                    testID={`attempt-${a.attempt_id}`}
                    onPress={() => router.push(`/results/${a.attempt_id}`)}
                    style={styles.attemptCard}
                  >
                    <Text style={styles.attemptTitle} numberOfLines={2}>{a.test_title}</Text>
                    <Text style={styles.attemptScore}>
                      {a.score}<Text style={styles.attemptTotal}>/{a.total_marks}</Text>
                    </Text>
                    <Badge
                      label={`${a.accuracy}% acc`}
                      color={colors.onSuccess}
                      bg={colors.success}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Free practice */}
          <Text style={styles.sectionTitle}>Free Practice</Text>
          {freeSeries.map((s: any) => (
            <Pressable key={s.series_id} testID={`series-${s.series_id}`} onPress={() => router.push(`/series/${s.series_id}`)}>
              <Card style={styles.seriesCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seriesTitle}>{s.title}</Text>
                  <View style={styles.seriesMeta}>
                    <Clock size={14} color={colors.muted} />
                    <Text style={styles.seriesMetaText}>{s.test_count} tests</Text>
                    <Badge label="FREE" color={colors.onSuccess} bg={colors.success} />
                  </View>
                </View>
                <CaretRight size={20} color={colors.muted} />
              </Card>
            </Pressable>
          ))}

          <Pressable
            testID="see-all-passes"
            style={styles.seeAll}
            onPress={() => router.push("/(tabs)/explore")}
          >
            <Text style={styles.seeAllText}>See all exam passes</Text>
            <CaretRight size={18} color={colors.brandPrimary} weight="bold" />
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showAnn} transparent animationType="fade" onRequestClose={dismissAnn}>
        <View style={styles.annOverlay}>
          <View style={styles.annCard}>
            <View style={styles.annIcon}>
              <Megaphone size={30} color={colors.onBrandPrimary} weight="fill" />
            </View>
            <Pressable testID="close-announcement" onPress={dismissAnn} style={styles.annClose} hitSlop={12}>
              <X size={22} color={colors.muted} />
            </Pressable>
            <Text style={styles.annTitle}>{announcement.data?.title}</Text>
            <Text style={styles.annMsg}>{announcement.data?.message}</Text>
            <Pressable testID="got-it-announcement" onPress={dismissAnn} style={styles.annBtn}>
              <Text style={styles.annBtnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  greeting: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700" },
  name: { color: "#FFFFFF", fontSize: fontSize.xxl, fontWeight: "900", marginTop: 2 },
  passCard: {
    marginTop: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  passRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  passTitle: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800" },
  passSub: { color: "#CBD5E1", fontSize: fontSize.base, marginTop: 4 },
  passLink: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700", marginTop: 6 },
  body: { padding: spacing.xl, gap: spacing.sm },
  streakBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  fireCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  streakBannerNum: { fontSize: fontSize.lg, fontWeight: "900", color: colors.onSurface },
  streakBannerSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, fontWeight: "600" },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipRow: { gap: spacing.md, paddingRight: spacing.lg },
  catCard: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: 160,
  },
  catShort: { color: colors.brandPrimary, fontSize: fontSize.base, fontWeight: "900" },
  catName: { color: colors.onSurfaceSecondary, fontSize: fontSize.sm, marginTop: 4 },
  hRow: { gap: spacing.md, paddingRight: spacing.lg },
  attemptCard: {
    flexShrink: 0,
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  attemptTitle: { color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "700", minHeight: 36 },
  attemptScore: { color: colors.brandPrimary, fontSize: fontSize.xxl, fontWeight: "900" },
  attemptTotal: { color: colors.muted, fontSize: fontSize.base, fontWeight: "700" },
  seriesCard: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  seriesTitle: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: "700" },
  seriesMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  seriesMetaText: { color: colors.muted, fontSize: fontSize.sm },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  seeAllText: { color: colors.brandPrimary, fontSize: fontSize.base, fontWeight: "800" },
  annOverlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  annCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, width: "100%", maxWidth: 420, alignItems: "center", gap: spacing.sm },
  annIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  annClose: { position: "absolute", top: spacing.md, right: spacing.md },
  annTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface, textAlign: "center" },
  annMsg: { fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 22 },
  annBtn: { marginTop: spacing.md, alignSelf: "stretch", backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  annBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
}));
