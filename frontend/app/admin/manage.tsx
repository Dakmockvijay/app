import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { CaretRight, CaretLeft, Plus, Clock, ListChecks, PencilSimple, MicrosoftExcelLogo, WarningCircle, ArrowClockwise, DownloadSimple } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

const REQUIRED_COLS = [
  "Test Name", "Question Text (EN)", "Option A (EN)", "Option B (EN)",
  "Option C (EN)", "Option D (EN)", "Correct Answer (A/B/C/D)",
];
const OPTIONAL_COLS = ["Time Limit (min)", "Marks", "Paper", "Question Text (HI)", "Option A–D (HI)", "Explanation (EN/HI)"];

export default function AdminManage() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });

  const [cat, setCat] = useState<any | null>(null);
  const [isFree, setIsFree] = useState<boolean | null>(null);
  const [stype, setStype] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const level = cat === null ? 1 : isFree === null ? 2 : stype === null ? 3 : 4;

  const bucket = useQuery({
    queryKey: ["manage-bucket", cat?.category_id, isFree, stype],
    enabled: level === 4,
    refetchInterval: 8000,
    queryFn: async () => {
      const b = await api.post("/admin/ensure-series", { category_id: cat.category_id, is_free: isFree, series_type: stype });
      const tests = await api.get(`/admin/test-series/${b.series_id}/tests`);
      return { series_id: b.series_id, tests };
    },
  });

  const back = () => {
    if (stype !== null) setStype(null);
    else if (isFree !== null) setIsFree(null);
    else if (cat !== null) setCat(null);
    else router.back();
  };

  const selectAndUpload = async () => {
    if (!bucket.data) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", ".xlsx", ".xls"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      const form = new FormData();
      if (Platform.OS === "web" && (asset as any).file) form.append("file", (asset as any).file);
      else form.append("file", { uri: asset.uri, name: asset.name || "upload.xlsx", type: asset.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as any);
      form.append("category_id", cat.category_id);
      form.append("is_free", String(isFree));
      form.append("series_type", String(stype));
      const out = await api.uploadFile("/admin/bulk-upload-tagged", form);
      toast.show(`Uploaded ${out.tests_created} tests, ${out.questions_created} questions`, "success");
      bucket.refetch();
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    } finally { setUploading(false); }
  };

  const downloadTemplate = () => {
    Linking.openURL(`${api.baseUrl}/api/admin/sample-template`);
  };

  const crumb = [cat?.short, isFree === null ? null : isFree ? "Free" : "Paid", stype ? stype.toUpperCase() : null].filter(Boolean).join("  ›  ");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="manage-back" onPress={back} hitSlop={12} style={styles.backBtn}><CaretLeft size={24} color="#FFFFFF" weight="bold" /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Manage Tests</Text>
          <Text style={styles.headerSub}>{crumb || "Select exam category"}</Text>
        </View>
      </View>

      {cats.isLoading ? <Loading /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          {level === 1 && (cats.data || []).map((c: any) => (
            <Pressable key={c.category_id} testID={`lvl1-${c.category_id}`} onPress={() => setCat(c)}>
              <Card style={styles.row}><Text style={styles.rowLabel}>{c.name}</Text><CaretRight size={20} color={colors.muted} /></Card>
            </Pressable>
          ))}

          {level === 2 && [{ k: true, l: "Free Tests" }, { k: false, l: "Paid Tests" }].map((o) => (
            <Pressable key={String(o.k)} testID={`lvl2-${o.k}`} onPress={() => setIsFree(o.k)}>
              <Card style={styles.row}><Text style={styles.rowLabel}>{o.l}</Text><CaretRight size={20} color={colors.muted} /></Card>
            </Pressable>
          ))}

          {level === 3 && [{ k: "mock", l: "Mock Tests" }, { k: "pyq", l: "Previous Year (PYQ)" }].map((o) => (
            <Pressable key={o.k} testID={`lvl3-${o.k}`} onPress={() => setStype(o.k)}>
              <Card style={styles.row}><Text style={styles.rowLabel}>{o.l}</Text><CaretRight size={20} color={colors.muted} /></Card>
            </Pressable>
          ))}

          {level === 4 && (
            <>
              {bucket.isError ? (
                <Card style={{ gap: spacing.md, alignItems: "center" }}>
                  <WarningCircle size={40} color={colors.error} weight="fill" />
                  <Text style={styles.errTitle}>Can&apos;t load this bucket</Text>
                  <Text style={styles.empty}>
                    The server rejected this request. If you recently added new features, your backend may be running old code — redeploy the latest backend. Tap retry to try again.
                  </Text>
                  <Pressable testID="bucket-retry" onPress={() => bucket.refetch()} style={[styles.actBtn, { backgroundColor: colors.brandPrimary, alignSelf: "stretch" }]}>
                    <ArrowClockwise size={18} color={colors.onBrandPrimary} weight="bold" /><Text style={styles.actText}>Retry</Text>
                  </Pressable>
                </Card>
              ) : (
                <>
                  <Pressable testID="add-manual" onPress={() => router.push(`/admin/test-editor?seriesId=${bucket.data?.series_id}`)} style={[styles.actBtn, { backgroundColor: colors.brandPrimary }]} disabled={!bucket.data}>
                    <Plus size={18} color={colors.onBrandPrimary} weight="bold" /><Text style={styles.actText}>Add Test Manually</Text>
                  </Pressable>

                  {/* Bulk upload card */}
                  <Card style={styles.uploadCard}>
                    <View style={styles.xlsBadge}>
                      <MicrosoftExcelLogo size={34} color="#1D6F42" weight="fill" />
                    </View>
                    <Text style={styles.uploadTitle}>Upload Excel (.xlsx)</Text>
                    <Text style={styles.uploadSub}>Rows with the same Test Name are grouped into one test.</Text>
                    <Pressable testID="bulk-upload-tagged" onPress={selectAndUpload} style={[styles.uploadBtn, (uploading || !bucket.data) && { opacity: 0.6 }]} disabled={uploading || !bucket.data}>
                      <Text style={styles.uploadBtnText}>{uploading ? "Uploading…" : "Select & Upload File"}</Text>
                    </Pressable>
                  </Card>

                  {/* Sample template */}
                  <Card style={{ gap: spacing.md }}>
                    <View style={styles.row}>
                      <Text style={styles.tplTitle}>Sample Template</Text>
                      <Pressable testID="download-template" onPress={downloadTemplate} style={styles.dlBtn}>
                        <DownloadSimple size={16} color={colors.brandPrimary} weight="bold" />
                        <Text style={styles.dlText}>Download</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.tplLabel}>Required columns</Text>
                    <View style={styles.chipWrap}>
                      {REQUIRED_COLS.map((c) => (
                        <View key={c} style={[styles.chip, { backgroundColor: "#FDECEE" }]}><Text style={[styles.chipText, { color: colors.brandPrimary }]}>{c}</Text></View>
                      ))}
                    </View>
                    <Text style={styles.tplLabel}>Optional columns</Text>
                    <View style={styles.chipWrap}>
                      {OPTIONAL_COLS.map((c) => (
                        <View key={c} style={[styles.chip, { backgroundColor: colors.surfaceTertiary }]}><Text style={[styles.chipText, { color: colors.muted }]}>{c}</Text></View>
                      ))}
                    </View>
                  </Card>

                  {bucket.isLoading ? <Loading /> : (bucket.data?.tests || []).length === 0 ? (
                    <Card><Text style={styles.empty}>No tests in this bucket yet. Add manually or upload an .xlsx.</Text></Card>
                  ) : (
                    (bucket.data?.tests || []).map((t: any) => (
                      <Pressable key={t.test_id} testID={`manage-test-${t.test_id}`} onPress={() => router.push(`/admin/test-editor?testId=${t.test_id}`)}>
                        <Card style={{ gap: spacing.sm }}>
                          <View style={styles.row}>
                            <Text style={styles.rowLabel}>{t.title}</Text>
                            {!!t.paper && <Badge label={t.paper} color={colors.onBrandSecondary} bg={colors.brandSecondary} />}
                          </View>
                          <View style={styles.metaRow}>
                            <View style={styles.metaItem}><Clock size={14} color={colors.muted} /><Text style={styles.meta}>{t.duration_min} min</Text></View>
                            <View style={styles.metaItem}><ListChecks size={14} color={colors.muted} /><Text style={styles.meta}>{t.question_count} Qs</Text></View>
                            <View style={styles.metaItem}><PencilSimple size={14} color={colors.info} /><Text style={[styles.meta, { color: colors.info }]}>Edit</Text></View>
                          </View>
                        </Card>
                      </Pressable>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  backBtn: { padding: spacing.xs },
  headerTitle: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "900" },
  headerSub: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { flex: 1, fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  actionRow: { flexDirection: "row", gap: spacing.md },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  actText: { color: "#FFFFFF", fontWeight: "800", fontSize: fontSize.base },
  uploadCard: { alignItems: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed" },
  xlsBadge: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: "#E7F6EE", alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  uploadTitle: { fontSize: fontSize.lg, fontWeight: "900", color: colors.onSurface },
  uploadSub: { fontSize: fontSize.sm, color: colors.muted, textAlign: "center", lineHeight: 18 },
  uploadBtn: { alignSelf: "stretch", backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
  uploadBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
  tplTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.brandPrimary },
  dlText: { color: colors.brandPrimary, fontWeight: "800", fontSize: fontSize.sm },
  tplLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  chipText: { fontSize: fontSize.sm, fontWeight: "700" },
  errTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  metaRow: { flexDirection: "row", gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  empty: { color: colors.muted, textAlign: "center", fontSize: fontSize.base },
}));
