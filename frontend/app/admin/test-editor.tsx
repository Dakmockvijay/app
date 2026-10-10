import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { Plus, Trash, CheckCircle, FloppyDisk, Image as ImageIcon, X, ArrowsClockwise } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

type Q = {
  question_en: string;
  question_hi: string;
  options_en: string[];
  options_hi: string[];
  correct_index: number;
  explanation_en: string;
  explanation_hi: string;
  marks: number;
  question_image_en: string;
  question_image_hi: string;
  option_images_en: string[];
  option_images_hi: string[];
};

const blankQ = (): Q => ({
  question_en: "", question_hi: "",
  options_en: ["", "", "", ""], options_hi: ["", "", "", ""],
  correct_index: 0, explanation_en: "", explanation_hi: "", marks: 1,
  question_image_en: "", question_image_hi: "",
  option_images_en: ["", "", "", ""], option_images_hi: ["", "", "", ""],
});

export default function TestEditor() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { seriesId, testId } = useLocalSearchParams<{ seriesId?: string; testId?: string }>();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30");
  const [paper, setPaper] = useState("");
  const [questions, setQuestions] = useState<Q[]>([blankQ()]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!testId);

  useEffect(() => {
    if (!testId) return;
    (async () => {
      try {
        const t = await api.get(`/admin/tests/${testId}`);
        setTitle(t.title);
        setDuration(String(t.duration_min));
        setPaper(t.paper || "");
        setQuestions((t.questions || []).map((q: any) => ({
          question_en: q.question_en || "", question_hi: q.question_hi || "",
          options_en: [0, 1, 2, 3].map((i) => q.options_en?.[i] || ""),
          options_hi: [0, 1, 2, 3].map((i) => q.options_hi?.[i] || ""),
          correct_index: q.correct_index ?? 0,
          explanation_en: q.explanation_en || "", explanation_hi: q.explanation_hi || "",
          marks: q.marks ?? 1,
          question_image_en: q.question_image_en || "", question_image_hi: q.question_image_hi || "",
          option_images_en: [0, 1, 2, 3].map((i) => q.option_images_en?.[i] || ""),
          option_images_hi: [0, 1, 2, 3].map((i) => q.option_images_hi?.[i] || ""),
        })));
      } catch (e: any) { toast.show(e.message, "error"); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const patchQ = (idx: number, patch: Partial<Q>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  const patchOpt = (qi: number, oi: number, lang: "en" | "hi", val: string) =>
    setQuestions((qs) => qs.map((q, i) => {
      if (i !== qi) return q;
      const key = lang === "en" ? "options_en" : "options_hi";
      const arr = [...(q as any)[key]];
      arr[oi] = val;
      return { ...q, [key]: arr };
    }));

  const patchOptImg = (qi: number, oi: number, lang: "en" | "hi", url: string) =>
    setQuestions((qs) => qs.map((q, i) => {
      if (i !== qi) return q;
      const key = lang === "en" ? "option_images_en" : "option_images_hi";
      const arr = [...(q as any)[key]];
      while (arr.length < 4) arr.push("");
      arr[oi] = url;
      return { ...q, [key]: arr };
    }));

  // Which field should receive a pasted image (last focused). Returns a setter.
  const focusedRef = useRef<((url: string) => void) | null>(null);

  const uploadAsset = async (asset: any): Promise<string> => {
    const form = new FormData();
    if (Platform.OS === "web" && asset.file) form.append("file", asset.file);
    else form.append("file", { uri: asset.uri, name: asset.name || "img.png", type: asset.mimeType || "image/png" } as any);
    const out = await api.uploadFile("/admin/upload-image", form);
    return out.url as string;
  };

  const pickAndApply = async (apply: (url: string) => void) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["image/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const url = await uploadAsset(res.assets[0]);
      apply(url);
      toast.show("Image attached", "success");
    } catch (e: any) { toast.show(e.message || "Upload failed", "error"); }
  };

  // Web: intercept clipboard paste; if an image is on the clipboard, upload it
  // and attach to the last-focused field.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = async (e: any) => {
      const apply = focusedRef.current;
      if (!apply) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (!blob) continue;
          e.preventDefault();
          try {
            const form = new FormData();
            form.append("file", blob, `paste.${(it.type.split("/")[1] || "png")}`);
            const out = await api.uploadFile("/admin/upload-image", form);
            apply(out.url);
            toast.show("Image pasted & attached", "success");
          } catch (err: any) { toast.show(err.message || "Paste upload failed", "error"); }
          break;
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderImageAttach = (url: string, onChange: (u: string) => void, tid: string) => (
    url ? (
      <View style={styles.imgPreviewWrap}>
        <Image source={{ uri: api.baseUrl + url }} style={styles.imgPreview} resizeMode="contain" />
        <View style={styles.imgActions}>
          <Pressable testID={`${tid}-replace`} onPress={() => pickAndApply(onChange)} style={styles.imgBtn}>
            <ArrowsClockwise size={14} color={colors.brandPrimary} weight="bold" /><Text style={styles.imgBtnText}>Replace</Text>
          </Pressable>
          <Pressable testID={`${tid}-remove`} onPress={() => onChange("")} style={styles.imgBtnDel}>
            <X size={14} color={colors.error} weight="bold" /><Text style={styles.imgBtnDelText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    ) : (
      <Pressable testID={`${tid}-add`} onPress={() => pickAndApply(onChange)} style={styles.imgAddBtn}>
        <ImageIcon size={16} color={colors.muted} weight="bold" />
        <Text style={styles.imgAddText}>{Platform.OS === "web" ? "Add image (or focus & paste Ctrl+V)" : "Add image"}</Text>
      </Pressable>
    )
  );

  const save = async () => {
    if (!title.trim()) { toast.show("Enter a test title", "error"); return; }
    const hasQ = (q: Q) => q.question_en.trim() || q.question_image_en;
    const optFilled = (q: Q) => q.options_en.some((o, i) => o.trim() || q.option_images_en[i]);
    const clean = questions.filter((q) => hasQ(q) && optFilled(q));
    if (clean.length === 0) { toast.show("Add at least one question with options", "error"); return; }
    for (const q of clean) {
      const filled = q.options_en.filter((o, i) => o.trim() || q.option_images_en[i]).length;
      if (filled < 2) {
        toast.show("Each question needs at least 2 options", "error");
        return;
      }
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        duration_min: parseInt(duration) || 30,
        paper: paper.trim(),
        questions: clean.map((q) => ({ ...q, marks: Number(q.marks) || 1 })),
      };
      if (testId) {
        await api.put(`/admin/tests/${testId}`, payload);
      } else {
        await api.post("/admin/tests", { series_id: seriesId, ...payload });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-series-tests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
      queryClient.invalidateQueries({ queryKey: ["series-tests"] });
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
      toast.show("Test saved", "success");
      router.back();
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={testId ? "Edit Test" : "New Test"} subtitle={`${questions.length} question(s)`} />
      {loading ? (
        <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>
      ) : (
        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 90, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <Field label="Test Title" value={title} onChangeText={setTitle} placeholder="e.g. PA/SA Mock Test 1" testID="test-title" />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" testID="test-duration" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Paper (optional)" value={paper} onChangeText={setPaper} placeholder="Paper 1 / Paper 2" testID="test-paper" />
              </View>
            </View>
            <Text style={styles.hint}>Tip: set Paper 1 / Paper 2 to split a category exam into papers.</Text>
          </Card>

          {questions.map((q, qi) => (
            <Card key={qi} style={{ gap: spacing.sm }}>
              <View style={styles.qHeader}>
                <Text style={styles.qTitle}>Question {qi + 1}</Text>
                {questions.length > 1 && (
                  <Pressable testID={`del-q-${qi}`} onPress={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} hitSlop={8}>
                    <Trash size={20} color={colors.error} weight="bold" />
                  </Pressable>
                )}
              </View>
              <Field label="Question (English)" value={q.question_en} onChangeText={(v) => patchQ(qi, { question_en: v })} onFocus={() => { focusedRef.current = (u) => patchQ(qi, { question_image_en: u }); }} placeholder="Question text" multiline testID={`q-en-${qi}`} />
              {renderImageAttach(q.question_image_en, (u) => patchQ(qi, { question_image_en: u }), `qimg-en-${qi}`)}
              <Field label="Question (Hindi)" value={q.question_hi} onChangeText={(v) => patchQ(qi, { question_hi: v })} onFocus={() => { focusedRef.current = (u) => patchQ(qi, { question_image_hi: u }); }} placeholder="प्रश्न (वैकल्पिक)" multiline testID={`q-hi-${qi}`} />
              {renderImageAttach(q.question_image_hi, (u) => patchQ(qi, { question_image_hi: u }), `qimg-hi-${qi}`)}

              <Text style={styles.optLabel}>Options — tap the letter to mark the correct answer</Text>
              {[0, 1, 2, 3].map((oi) => {
                const correct = q.correct_index === oi;
                return (
                  <View key={oi} style={styles.optBlock}>
                    <Pressable testID={`correct-${qi}-${oi}`} onPress={() => patchQ(qi, { correct_index: oi })} style={[styles.letter, correct && styles.letterCorrect]}>
                      {correct ? <CheckCircle size={18} color={colors.onSuccess} weight="fill" /> : <Text style={styles.letterText}>{String.fromCharCode(65 + oi)}</Text>}
                    </Pressable>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Field value={q.options_en[oi]} onChangeText={(v) => patchOpt(qi, oi, "en", v)} onFocus={() => { focusedRef.current = (u) => patchOptImg(qi, oi, "en", u); }} placeholder={`Option ${String.fromCharCode(65 + oi)} (EN)`} testID={`opt-en-${qi}-${oi}`} style={styles.optInput} />
                      {renderImageAttach(q.option_images_en[oi], (u) => patchOptImg(qi, oi, "en", u), `optimg-en-${qi}-${oi}`)}
                      <Field value={q.options_hi[oi]} onChangeText={(v) => patchOpt(qi, oi, "hi", v)} onFocus={() => { focusedRef.current = (u) => patchOptImg(qi, oi, "hi", u); }} placeholder={`विकल्प ${String.fromCharCode(65 + oi)} (HI)`} testID={`opt-hi-${qi}-${oi}`} style={styles.optInput} />
                      {renderImageAttach(q.option_images_hi[oi], (u) => patchOptImg(qi, oi, "hi", u), `optimg-hi-${qi}-${oi}`)}
                    </View>
                  </View>
                );
              })}

              <Field label="Explanation (EN)" value={q.explanation_en} onChangeText={(v) => patchQ(qi, { explanation_en: v })} placeholder="Why this answer is correct" multiline testID={`exp-en-${qi}`} />
              <Field label="Explanation (HI)" value={q.explanation_hi} onChangeText={(v) => patchQ(qi, { explanation_hi: v })} placeholder="स्पष्टीकरण (वैकल्पिक)" multiline testID={`exp-hi-${qi}`} />
              <Field label="Marks" value={String(q.marks)} onChangeText={(v) => patchQ(qi, { marks: Number(v.replace(/[^0-9.]/g, "")) || 0 })} keyboardType="decimal-pad" testID={`marks-${qi}`} />
            </Card>
          ))}

          <Pressable testID="add-question" onPress={() => setQuestions((qs) => [...qs, blankQ()])} style={styles.addQ}>
            <Plus size={20} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.addQText}>Add Question</Text>
          </Pressable>

          <AppButton title="Save Test" onPress={save} loading={busy} testID="save-test" icon={<FloppyDisk size={20} color={colors.onBrandPrimary} weight="fill" />} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: fontSize.base },
  row2: { flexDirection: "row", gap: spacing.md },
  hint: { fontSize: fontSize.sm, color: colors.muted },
  qHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qTitle: { fontSize: fontSize.lg, fontWeight: "900", color: colors.brandPrimary },
  optLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  optBlock: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  letter: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.border, marginTop: 4 },
  letterCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  letterText: { fontWeight: "800", color: colors.onSurfaceSecondary },
  optInput: { minHeight: 44, marginBottom: 0 },
  imgAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, marginBottom: spacing.sm },
  imgAddText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: "600" },
  imgPreviewWrap: { marginBottom: spacing.sm, gap: 6 },
  imgPreview: { width: "100%", height: 150, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  imgActions: { flexDirection: "row", gap: spacing.sm },
  imgBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  imgBtnText: { color: colors.brandPrimary, fontSize: fontSize.sm, fontWeight: "700" },
  imgBtnDel: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  imgBtnDelText: { color: colors.error, fontSize: fontSize.sm, fontWeight: "700" },
  addQ: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.brandPrimary },
  addQText: { color: colors.brandPrimary, fontWeight: "800", fontSize: fontSize.base },
}));
