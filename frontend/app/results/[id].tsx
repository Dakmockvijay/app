import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trophy, Target, CheckCircle, XCircle, MinusCircle, Medal, House } from "phosphor-react-native";

import { api } from "@/src/api";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

type Tab = "analysis" | "leaderboard" | "explanations";

export default function Results() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("analysis");

  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: () => api.get(`/attempts/${id}`) });
  const testId = attempt.data?.test_id;
  const lb = useQuery({
    queryKey: ["leaderboard", testId],
    queryFn: () => api.get(`/tests/${testId}/leaderboard`),
    enabled: !!testId,
  });

  if (attempt.isLoading || !attempt.data) return <Loading label="Calculating your score…" />;
  const a = attempt.data;
  const isPractice = a.mode === "practice";
  const detail: any[] = a.detail || [];
  const tabs: Tab[] = (["analysis", "leaderboard", "explanations"] as Tab[]).filter(
    (t) => !(isPractice && t === "leaderboard"),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.replace("/(tabs)")} hitSlop={12} style={styles.backBtn}>
          <House size={22} color="#FFFFFF" weight="fill" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{a.test_title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        {/* Score hero */}
        <View style={styles.hero}>
          {isPractice && (
            <View style={{ marginBottom: spacing.md }}>
              <Badge label="PRACTICE SESSION" color={colors.onBrandSecondary} bg={colors.brandSecondary} />
            </View>
          )}
          <View style={styles.ring}>
            <Text style={styles.percentile}>{isPractice ? a.accuracy : a.percentile}%</Text>
            <Text style={styles.percentileLabel}>{isPractice ? "accuracy" : "percentile"}</Text>
          </View>
          <View style={styles.scoreRow}>
            <View style={styles.scoreItem}>
              <Text style={styles.scoreVal}>{a.score}<Text style={styles.scoreTotal}>/{a.total_marks}</Text></Text>
              <Text style={styles.scoreLabel}>Score</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.scoreItem}>
              {isPractice ? (
                <>
                  <Text style={styles.scoreVal}>{a.correct}</Text>
                  <Text style={styles.scoreLabel}>Correct · not ranked</Text>
                </>
              ) : (
                <>
                  <View style={styles.rankRow}>
                    <Trophy size={18} color={colors.brandSecondary} weight="fill" />
                    <Text style={styles.scoreVal}>#{a.rank}</Text>
                  </View>
                  <Text style={styles.scoreLabel}>of {a.total_users} · All India</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Segmented */}
        <View style={styles.segment}>
          {tabs.map((t) => (
            <Pressable
              key={t}
              testID={`tab-${t}`}
              onPress={() => setTab(t)}
              style={[styles.segBtn, tab === t && styles.segActive]}
            >
              <Text style={[styles.segText, tab === t && styles.segTextActive]}>
                {t === "analysis" ? "Analysis" : t === "leaderboard" ? "Ranks" : "Solutions"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
          {tab === "analysis" && (
            <>
              <View style={styles.statGrid}>
                <StatCard icon={<CheckCircle size={22} color={colors.success} weight="fill" />} value={a.correct} label="Correct" />
                <StatCard icon={<XCircle size={22} color={colors.error} weight="fill" />} value={a.wrong} label="Wrong" />
                <StatCard icon={<MinusCircle size={22} color={colors.muted} weight="fill" />} value={a.unattempted} label="Skipped" />
                <StatCard icon={<Target size={22} color={colors.info} weight="fill" />} value={`${a.accuracy}%`} label="Accuracy" />
              </View>
              <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.timeText}>
                  Time taken: {Math.floor(a.time_taken_sec / 60)}m {a.time_taken_sec % 60}s
                </Text>
              </Card>
            </>
          )}

          {tab === "leaderboard" && (
            <>
              {lb.isLoading ? (
                <Loading />
              ) : (
                (lb.data || []).map((row: any) => (
                  <Card key={row.rank} style={[styles.lbRow, row.is_me && styles.lbMe]}>
                    <View style={styles.lbRank}>
                      {row.rank <= 3 ? (
                        <Medal size={22} color={row.rank === 1 ? "#FFD700" : row.rank === 2 ? "#C0C0C0" : "#CD7F32"} weight="fill" />
                      ) : (
                        <Text style={styles.lbRankNum}>{row.rank}</Text>
                      )}
                    </View>
                    <Text style={[styles.lbName, row.is_me && { fontWeight: "900" }]} numberOfLines={1}>
                      {row.name}{row.is_me ? " (You)" : ""}
                    </Text>
                    <Text style={styles.lbScore}>{row.score}</Text>
                  </Card>
                ))
              )}
            </>
          )}

          {tab === "explanations" && (
            <>
              {detail.map((d) => {
                const opts = d.options_en || [];
                return (
                  <Card key={d.index} style={{ gap: spacing.sm }}>
                    <View style={styles.expHead}>
                      <Text style={styles.expNum}>Q{d.index + 1}</Text>
                      {d.selected_index === null ? (
                        <Badge label="Skipped" color={colors.onSurfaceTertiary} bg={colors.surfaceTertiary} />
                      ) : d.is_correct ? (
                        <Badge label="Correct" color={colors.onSuccess} bg={colors.success} />
                      ) : (
                        <Badge label="Wrong" color={colors.onError} bg={colors.error} />
                      )}
                    </View>
                    <Text style={styles.expQ}>{d.question_en}</Text>
                    {opts.map((o: string, i: number) => {
                      const isCorrect = i === d.correct_index;
                      const isSelected = i === d.selected_index;
                      return (
                        <View
                          key={i}
                          style={[
                            styles.expOpt,
                            isCorrect && styles.expCorrect,
                            isSelected && !isCorrect && styles.expWrong,
                          ]}
                        >
                          <Text style={[styles.expOptText, (isCorrect || (isSelected && !isCorrect)) && { fontWeight: "700" }]}>
                            {String.fromCharCode(65 + i)}. {o}
                          </Text>
                          {isCorrect && <CheckCircle size={16} color={colors.success} weight="fill" />}
                          {isSelected && !isCorrect && <XCircle size={16} color={colors.error} weight="fill" />}
                        </View>
                      );
                    })}
                    {!!d.explanation_en && (
                      <View style={styles.expBox}>
                        <Text style={styles.expLabel}>Explanation</Text>
                        <Text style={styles.expExpl}>{d.explanation_en}</Text>
                        {!!d.explanation_hi && <Text style={[styles.expExpl, { marginTop: 4 }]}>{d.explanation_hi}</Text>}
                      </View>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
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
    paddingBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { flex: 1, color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800" },
  hero: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  ring: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 8,
    borderColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  percentile: { color: "#FFFFFF", fontSize: 34, fontWeight: "900" },
  percentileLabel: { color: "#CBD5E1", fontSize: fontSize.sm },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radius.md,
    padding: spacing.lg,
    width: "100%",
  },
  scoreItem: { flex: 1, alignItems: "center" },
  scoreVal: { color: "#FFFFFF", fontSize: fontSize.xxl, fontWeight: "900" },
  scoreTotal: { color: "#CBD5E1", fontSize: fontSize.base, fontWeight: "700" },
  scoreLabel: { color: "#CBD5E1", fontSize: fontSize.sm, marginTop: 2 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  divider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.2)" },
  segment: {
    flexDirection: "row",
    margin: spacing.xl,
    marginBottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  segActive: { backgroundColor: colors.brandPrimary },
  segText: { fontWeight: "700", color: colors.muted, fontSize: fontSize.base },
  segTextActive: { color: colors.onBrandPrimary },
  body: { padding: spacing.xl, gap: spacing.md },
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
  timeText: { color: colors.onSurfaceSecondary, fontSize: fontSize.base, fontWeight: "600", textAlign: "center" },
  lbRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  lbMe: { borderColor: colors.brandPrimary, borderWidth: 2, backgroundColor: "#FDECEE" },
  lbRank: { width: 32, alignItems: "center" },
  lbRankNum: { fontSize: fontSize.lg, fontWeight: "900", color: colors.muted },
  lbName: { flex: 1, fontSize: fontSize.base, color: colors.onSurface, fontWeight: "600" },
  lbScore: { fontSize: fontSize.lg, fontWeight: "900", color: colors.brandPrimary },
  expHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  expNum: { fontSize: fontSize.base, fontWeight: "900", color: colors.brandPrimary },
  expQ: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface, lineHeight: 22 },
  expOpt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  expCorrect: { backgroundColor: "#E7F6EE", borderColor: colors.success },
  expWrong: { backgroundColor: "#FDECEE", borderColor: colors.error },
  expOptText: { flex: 1, color: colors.onSurface, fontSize: fontSize.base },
  expBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md, marginTop: 4 },
  expLabel: { fontSize: fontSize.sm, fontWeight: "800", color: colors.info, marginBottom: 4 },
  expExpl: { fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
}));
