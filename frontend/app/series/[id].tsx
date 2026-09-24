import React, { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretLeft, Clock, ListChecks, Play, ChartBar } from "phosphor-react-native";

import { api } from "@/src/api";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function SeriesDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const q = useQuery({
    queryKey: ["series-tests", id],
    queryFn: () => api.get(`/test-series/${id}/tests`),
    refetchInterval: 10000,
  });

  const rows = useMemo(() => {
    const tests: any[] = q.data?.tests || [];
    const papers: string[] = [];
    const map: Record<string, any[]> = {};
    tests.forEach((t) => {
      const p = t.paper || "";
      if (!map[p]) { map[p] = []; papers.push(p); }
      map[p].push(t);
    });
    const hasPapers = papers.some((p) => p);
    const out: any[] = [];
    papers.forEach((p) => {
      if (hasPapers) out.push({ __header: p || "Other" });
      map[p].forEach((t) => out.push(t));
    });
    return out;
  }, [q.data]);

  if (q.isLoading) return <Loading label="Loading tests…" />;
  const series = q.data?.series;
  const tests: any[] = q.data?.tests || [];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <CaretLeft size={24} color="#FFFFFF" weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={2}>{series?.title}</Text>
          <Text style={styles.headerSub}>{tests.length} tests</Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => (item.__header ? `h-${item.__header}` : item.test_id)}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.__header) {
            return <Text style={styles.paperHeader}>{item.__header}</Text>;
          }
          return (
          <Card>
            <Text style={styles.testTitle}>{item.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Clock size={15} color={colors.muted} />
                <Text style={styles.metaText}>{item.duration_min} min</Text>
              </View>
              <View style={styles.metaItem}>
                <ListChecks size={15} color={colors.muted} />
                <Text style={styles.metaText}>{item.question_count} Qs</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>{item.total_marks} marks</Text>
              </View>
            </View>

            {item.attempted && (
              <Badge
                label={`Last score: ${item.last_score}/${item.total_marks}`}
                color={colors.onBrandSecondary}
                bg={colors.brandSecondary}
              />
            )}

            <View style={styles.actions}>
              <Pressable
                testID={`start-test-${item.test_id}`}
                style={styles.startBtn}
                onPress={() => router.push(`/exam/${item.test_id}`)}
              >
                <Play size={16} color={colors.onBrandPrimary} weight="fill" />
                <Text style={styles.startText}>{item.attempted ? "Re-attempt" : "Start Test"}</Text>
              </Pressable>
              {item.attempted && (
                <Pressable
                  testID={`view-result-${item.test_id}`}
                  style={styles.resultBtn}
                  onPress={() => router.push(`/results/${item.last_attempt_id}`)}
                >
                  <ChartBar size={16} color={colors.brandPrimary} weight="bold" />
                  <Text style={styles.resultText}>Result</Text>
                </Pressable>
              )}
            </View>
          </Card>
          );
        }}
      />
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
  headerSub: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700", marginTop: 2 },
  testTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  paperHeader: { fontSize: fontSize.lg, fontWeight: "900", color: colors.brandTertiary, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  startBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  startText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
  resultBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
  },
  resultText: { color: colors.brandPrimary, fontWeight: "800", fontSize: fontSize.base },
}));
