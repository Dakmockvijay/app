import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import {
  GridFour,
  BookmarkSimple,
  Eraser,
  CaretRight,
  Clock,
  CheckCircle,
  Warning,
} from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { Loading } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Exam() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const paletteRef = useRef<BottomSheetModal>(null);

  const q = useQuery({ queryKey: ["test", id], queryFn: () => api.get(`/tests/${id}`) });

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startTime = useRef(Date.now());

  const questions: any[] = q.data?.questions || [];

  useEffect(() => {
    if (q.data && timeLeft === null) {
      setTimeLeft(q.data.duration_min * 60);
      startTime.current = Date.now();
    }
  }, [q.data, timeLeft]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const timeTaken = Math.round((Date.now() - startTime.current) / 1000);
      const payload = Object.fromEntries(Object.entries(answers).map(([k, v]) => [String(k), v]));
      const res = await api.post(`/tests/${id}/submit`, { answers: payload, time_taken_sec: timeTaken });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["attempts"] });
      queryClient.invalidateQueries({ queryKey: ["series-tests"] });
      router.replace(`/results/${res.attempt_id}`);
    } catch (e: any) {
      toast.show(e.message || "Submit failed", "error");
      setSubmitting(false);
    }
  }, [answers, id, router, toast]);

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => (v === null ? v : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, submit]);

  if (q.isLoading || timeLeft === null) return <Loading label="Loading exam…" />;

  const que = questions[current];
  const opts: string[] = (lang === "hi" && que.options_hi?.length ? que.options_hi : que.options_en) || [];
  const qtext = lang === "hi" && que.question_hi ? que.question_hi : que.question_en;
  const answeredCount = Object.keys(answers).length;

  const select = (i: number) => {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, [current]: i }));
  };
  const clearAns = () => {
    setAnswers((a) => {
      const n = { ...a };
      delete n[current];
      return n;
    });
  };
  const toggleMark = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(current)) n.delete(current);
      else n.add(current);
      return n;
    });
  };
  const saveNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (current < questions.length - 1) setCurrent((c) => c + 1);
    else setShowConfirm(true);
  };

  const statusColor = (i: number) => {
    if (marked.has(i)) return colors.brandTertiary;
    if (answers[i] !== undefined) return colors.success;
    return colors.surfaceTertiary;
  };
  const statusTextColor = (i: number) =>
    marked.has(i) || answers[i] !== undefined ? "#FFFFFF" : colors.onSurfaceTertiary;

  const lowTime = timeLeft <= 60;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={[styles.timerBox, lowTime && { backgroundColor: colors.error }]}>
          <Clock size={16} color="#FFFFFF" weight="bold" />
          <Text style={styles.timer} testID="exam-timer">{fmt(timeLeft)}</Text>
        </View>
        <View style={styles.langToggle}>
          {(["en", "hi"] as const).map((l) => (
            <Pressable
              key={l}
              testID={`lang-${l}`}
              onPress={() => { Haptics.selectionAsync(); setLang(l); }}
              style={[styles.langBtn, lang === l && styles.langActive]}
            >
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                {l === "en" ? "EN" : "हिं"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable testID="open-palette" onPress={() => paletteRef.current?.present()} style={styles.paletteBtn}>
          <GridFour size={22} color="#FFFFFF" weight="fill" />
        </Pressable>
        <Pressable testID="submit-exam" onPress={() => setShowConfirm(true)} style={styles.submitBtn}>
          <Text style={styles.submitBtnText}>Submit</Text>
        </Pressable>
      </View>

      {/* Question */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.qNumRow}>
          <Text style={styles.qNum}>Question {current + 1} of {questions.length}</Text>
          <Text style={styles.qMarks}>+{que.marks} mark</Text>
        </View>
        <Text style={styles.qText}>{qtext}</Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {opts.map((o, i) => {
            const sel = answers[current] === i;
            return (
              <Pressable
                key={i}
                testID={`option-${i}`}
                onPress={() => select(i)}
                style={[styles.option, sel && styles.optionSel]}
              >
                <View style={[styles.optBullet, sel && styles.optBulletSel]}>
                  <Text style={[styles.optLetter, sel && styles.optLetterSel]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[styles.optText, sel && styles.optTextSel]}>{o}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky bottom actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.bottomRow}>
          <Pressable testID="mark-review" onPress={toggleMark} style={styles.secBtn}>
            <BookmarkSimple
              size={18}
              color={marked.has(current) ? colors.brandTertiary : colors.onSurfaceSecondary}
              weight={marked.has(current) ? "fill" : "regular"}
            />
            <Text style={styles.secBtnText}>{marked.has(current) ? "Marked" : "Review"}</Text>
          </Pressable>
          <Pressable testID="clear-ans" onPress={clearAns} style={styles.secBtn}>
            <Eraser size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.secBtnText}>Clear</Text>
          </Pressable>
          <Pressable testID="save-next" onPress={saveNext} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>
              {current < questions.length - 1 ? "Save & Next" : "Save & Finish"}
            </Text>
            <CaretRight size={18} color={colors.onBrandPrimary} weight="bold" />
          </Pressable>
        </View>
      </View>

      {/* Palette bottom sheet */}
      <BottomSheetModal
        ref={paletteRef}
        snapPoints={["55%"]}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      >
        <BottomSheetView style={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
          <Text style={styles.paletteTitle}>Question Palette</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>Answered</Text></View>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.surfaceTertiary }]} /><Text style={styles.legendText}>Not answered</Text></View>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.brandTertiary }]} /><Text style={styles.legendText}>Review</Text></View>
          </View>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {questions.map((_, i) => (
              <Pressable
                key={i}
                testID={`palette-q-${i}`}
                onPress={() => { setCurrent(i); paletteRef.current?.dismiss(); }}
                style={[styles.gridCell, { backgroundColor: statusColor(i) }, current === i && styles.gridCellCurrent]}
              >
                <Text style={[styles.gridNum, { color: statusTextColor(i) }]}>{i + 1}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Confirm submit */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Warning size={40} color={colors.warning} weight="fill" />
            <Text style={styles.confirmTitle}>Submit Test?</Text>
            <Text style={styles.confirmText}>
              Answered {answeredCount} of {questions.length}. {questions.length - answeredCount} unanswered.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable testID="cancel-submit" onPress={() => setShowConfirm(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Keep Solving</Text>
              </Pressable>
              <Pressable testID="confirm-submit" onPress={submit} disabled={submitting} style={styles.confirmBtn}>
                <CheckCircle size={18} color={colors.onBrandPrimary} weight="fill" />
                <Text style={styles.confirmBtnText}>{submitting ? "Submitting…" : "Submit"}</Text>
              </Pressable>
            </View>
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  timer: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "900", fontVariant: ["tabular-nums"] },
  langToggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.sm, padding: 2 },
  langBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm - 2 },
  langActive: { backgroundColor: colors.brandSecondary },
  langText: { color: "#FFFFFF", fontWeight: "800", fontSize: fontSize.sm },
  langTextActive: { color: colors.onBrandSecondary },
  paletteBtn: { padding: spacing.sm, marginLeft: "auto" },
  submitBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  submitBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.sm },
  qNumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qNum: { color: colors.muted, fontSize: fontSize.base, fontWeight: "700" },
  qMarks: { color: colors.success, fontSize: fontSize.sm, fontWeight: "800" },
  qText: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: "700", marginTop: spacing.sm, lineHeight: 26 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSel: { borderColor: colors.brandPrimary, backgroundColor: "#FDECEE" },
  optBullet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  optBulletSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optLetter: { fontWeight: "800", color: colors.onSurfaceSecondary },
  optLetterSel: { color: colors.onBrandPrimary },
  optText: { flex: 1, color: colors.onSurface, fontSize: fontSize.base, fontWeight: "500" },
  optTextSel: { fontWeight: "700" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secBtnText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: fontSize.sm },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
  paletteTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  legendRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md, marginBottom: spacing.lg, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  legendText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCell: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridCellCurrent: { borderWidth: 2.5, borderColor: colors.brandPrimary },
  gridNum: { fontWeight: "800", fontSize: fontSize.base },
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
    maxWidth: 400,
  },
  confirmTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  confirmText: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%" },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  cancelText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: fontSize.base },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
}));
