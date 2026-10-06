import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polyline, Circle, Line } from "react-native-svg";
import {
  CaretLeft,
  Fire,
  Target,
  Trophy,
  ChartLineUp,
  CheckCircle,
  Minus,
  Plus,
  Clock,
  Exam,
} from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { Card, Loading, EmptyState } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Progress() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();

  const a = useQuery({ queryKey: ["analytics"], queryFn: () => api.get("/analytics"), refetchInterval: 20000 });

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(3);
  const [saving, setSaving] = useState(false);

  if (a.isLoading || !a.data) return <Loading label="Crunching your stats…" />;
  const d = a.data;
  const streak = d.streak || { current: 0, longest: 0, active_days: 0 };
  const today = d.today || { count: 0, goal: 3, met: false };
  const trend: any[] = d.trend || [];
  const cats: any[] = d.categories || [];

  const openGoal = () => { setGoalDraft(today.goal || 3); setGoalOpen(true); };
  const saveGoal = async () => {
    setSaving(true);
    try {
      await api.post("/me/goal", { daily_goal: goalDraft });
      await a.refetch();
      setGoalOpen(false);
      toast.show("Daily goal updated", "success");
    } catch (e: any) {
      toast.show(e.message || "Could not save goal", "error");
    } finally {
      setSaving(false);
    }
  };

  const goalPct = Math.min(1, today.count / Math.max(1, today.goal));

  // Trend chart geometry
  const chartW = width - spacing.xl * 2 - spacing.lg * 2;
  const chartH = 120;
  const pad = 6;
  const pts = trend.map((t) => t.accuracy as number);
  const maxY = 100;
  const stepX = pts.length > 1 ? (chartW - pad * 2) / (pts.length - 1) : 0;
  const coords = pts.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - v / maxY) * (chartH - pad * 2);
    return { x, y };
  });
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  const strongest = cats.length ? cats[0] : null;
  const weakest = cats.length > 1 ? cats[cats.length - 1] : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <CaretLeft size={24} color="#FFFFFF" weight="bold" />
        </Pressable>
        <Text style={styles.headerTitle}>Your Progress</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
      >
        {/* Streak + goal */}
        <View style={styles.streakCard}>
          <View style={styles.streakLeft}>
            <Fire size={34} color={colors.brandSecondary} weight="fill" />
            <View>
              <Text style={styles.streakNum} testID="streak-current">{streak.current}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>
          </View>
          <View style={styles.streakRight}>
            <Text style={styles.streakMeta}>Longest: {streak.longest} days</Text>
            <Text style={styles.streakMeta}>Active: {streak.active_days} days</Text>
          </View>
        </View>

        {/* Daily goal */}
        <Card>
          <View style={styles.goalHead}>
            <View style={styles.goalTitleRow}>
              <Target size={18} color={colors.brandPrimary} weight="fill" />
              <Text style={styles.goalTitle}>Today's Goal</Text>
            </View>
            <Pressable testID="edit-goal" onPress={openGoal}>
              <Text style={styles.goalEdit}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.goalProgress} testID="goal-progress">
            {today.count} / {today.goal} tests
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${goalPct * 100}%`, backgroundColor: today.met ? colors.success : colors.brandPrimary }]} />
          </View>
          {today.met && (
            <View style={styles.goalDone}>
              <CheckCircle size={16} color={colors.success} weight="fill" />
              <Text style={styles.goalDoneText}>Goal completed. Great work!</Text>
            </View>
          )}
        </Card>

        {d.total_attempts === 0 ? (
          <Card style={{ paddingVertical: spacing.xxl }}>
            <EmptyState title="No tests yet" subtitle="Take a test to unlock your performance insights." />
          </Card>
        ) : (
          <>
            {/* Overview */}
            <View style={styles.statGrid}>
              <StatCard icon={<Exam size={20} color={colors.brandPrimary} weight="fill" />} value={d.total_attempts} label="Tests" />
              <StatCard icon={<ChartLineUp size={20} color={colors.info} weight="fill" />} value={`${d.avg_score_pct}%`} label="Avg Score" />
              <StatCard icon={<Target size={20} color={colors.success} weight="fill" />} value={`${d.avg_accuracy}%`} label="Avg Accuracy" />
              <StatCard icon={<Trophy size={20} color={colors.brandSecondary} weight="fill" />} value={`${d.best_score_pct}%`} label="Best Score" />
            </View>

            <Card style={styles.timeCard}>
              <Clock size={18} color={colors.muted} />
              <Text style={styles.timeText}>Total time practised: {fmtTime(d.total_time_sec)}</Text>
            </Card>

            {/* Accuracy trend */}
            {trend.length >= 2 && (
              <Card>
                <Text style={styles.cardTitle}>Accuracy Trend</Text>
                <Text style={styles.cardSub}>Last {trend.length} attempts</Text>
                <View style={{ marginTop: spacing.md }}>
                  <Svg width={chartW} height={chartH}>
                    {[0, 50, 100].map((g) => {
                      const y = pad + (1 - g / maxY) * (chartH - pad * 2);
                      return <Line key={g} x1={0} y1={y} x2={chartW} y2={y} stroke={colors.border} strokeWidth={1} />;
                    })}
                    <Polyline points={polyline} fill="none" stroke={colors.brandPrimary} strokeWidth={2.5} />
                    {coords.map((c, i) => (
                      <Circle key={i} cx={c.x} cy={c.y} r={3} fill={colors.brandPrimary} />
                    ))}
                  </Svg>
                  <View style={styles.axisRow}>
                    <Text style={styles.axisText}>oldest</Text>
                    <Text style={styles.axisText}>latest</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Category performance */}
            {cats.length > 0 && (
              <Card>
                <Text style={styles.cardTitle}>Category Performance</Text>
                {strongest && (
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: "#E7F6EE" }]}>
                      <Text style={[styles.tagText, { color: colors.success }]}>💪 Strong: {strongest.name}</Text>
                    </View>
                    {weakest && (
                      <View style={[styles.tag, { backgroundColor: "#FDECEE" }]}>
                        <Text style={[styles.tagText, { color: colors.error }]}>📈 Focus: {weakest.name}</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  {cats.map((c) => (
                    <View key={c.category_id} testID={`cat-perf-${c.category_id}`}>
                      <View style={styles.barHead}>
                        <Text style={styles.barName} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.barVal}>{c.avg_accuracy}%</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(100, c.avg_accuracy)}%` }]} />
                      </View>
                      <Text style={styles.barMeta}>{c.attempts} tests · {c.avg_score_pct}% avg score</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* Goal editor */}
      <Modal visible={goalOpen} transparent animationType="fade" onRequestClose={() => setGoalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.goalCard}>
            <Target size={34} color={colors.brandPrimary} weight="fill" />
            <Text style={styles.goalCardTitle}>Daily Test Goal</Text>
            <Text style={styles.goalCardSub}>How many tests do you aim to complete each day?</Text>
            <View style={styles.stepper}>
              <Pressable
                testID="goal-minus"
                onPress={() => setGoalDraft((v) => Math.max(1, v - 1))}
                style={styles.stepBtn}
              >
                <Minus size={22} color={colors.brandPrimary} weight="bold" />
              </Pressable>
              <Text style={styles.stepVal} testID="goal-value">{goalDraft}</Text>
              <Pressable
                testID="goal-plus"
                onPress={() => setGoalDraft((v) => Math.min(50, v + 1))}
                style={styles.stepBtn}
              >
                <Plus size={22} color={colors.brandPrimary} weight="bold" />
              </Pressable>
            </View>
            <View style={styles.goalActions}>
              <Pressable testID="goal-cancel" onPress={() => setGoalOpen(false)} style={styles.goalCancel}>
                <Text style={styles.goalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable testID="goal-save" onPress={saveGoal} disabled={saving} style={styles.goalSave}>
                <Text style={styles.goalSaveText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: any; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      {icon}
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.brandTertiary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "900" },
  streakCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  streakLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  streakNum: { color: "#FFFFFF", fontSize: fontSize.xxxl, fontWeight: "900" },
  streakLabel: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700" },
  streakRight: { alignItems: "flex-end", gap: 4 },
  streakMeta: { color: "#CBD5E1", fontSize: fontSize.sm, fontWeight: "600" },
  goalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  goalTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  goalEdit: { color: colors.brandPrimary, fontWeight: "800", fontSize: fontSize.base },
  goalProgress: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface, marginTop: spacing.sm },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceTertiary, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5 },
  goalDone: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  goalDoneText: { color: colors.success, fontWeight: "700", fontSize: fontSize.sm },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statVal: { fontSize: fontSize.xxl, fontWeight: "900", color: colors.onSurface },
  statLabel: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  timeCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timeText: { color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "600" },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  cardSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  axisText: { fontSize: fontSize.sm, color: colors.muted },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  tag: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  tagText: { fontSize: fontSize.sm, fontWeight: "800" },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barName: { flex: 1, fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  barVal: { fontSize: fontSize.base, fontWeight: "900", color: colors.brandPrimary },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, marginTop: 6, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  barMeta: { fontSize: fontSize.sm, color: colors.muted, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  goalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm, width: "100%", maxWidth: 380 },
  goalCardTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  goalCardSub: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xl, marginVertical: spacing.md },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 36, fontWeight: "900", color: colors.onSurface, minWidth: 60, textAlign: "center" },
  goalActions: { flexDirection: "row", gap: spacing.md, width: "100%", marginTop: spacing.sm },
  goalCancel: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  goalCancelText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: fontSize.base },
  goalSave: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center" },
  goalSaveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
}));
