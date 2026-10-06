import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { CaretRight, CaretLeft, Plus, UploadSimple, Clock, ListChecks, PencilSimple, FileArrowUp, WarningCircle, ArrowClockwise, CheckCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

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
  const [file, setFile] = useState<any | null>(null);

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
    setFile(null);
    if (stype !== null) setStype(null);
    else if (isFree !== null) setIsFree(null);
    else if (cat !== null) setCat(null);
    else router.back();
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", ".xlsx", ".xls"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      setFile(res.assets[0]);
    } catch (e: any) {
      toast.show(e.message || "Could not open file picker", "error");
    }
  };

  const doUpload = async () => {
    if (!file || !bucket.data) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web" && (file as any).file) form.append("file", (file as any).file);
      else form.append("file", { uri: file.uri, name: file.name || "upload.xlsx", type: file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as any);
      form.append("category_id", cat.category_id);
      form.append("is_free", String(isFree));
      form.append("series_type", String(stype));
      const out = await api.uploadFile("/admin/bulk-upload-tagged", form);
      toast.show(`Uploaded ${out.tests_created} tests, ${out.questions_created} questions`, "success");
      setFile(null);
      bucket.refetch();
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    } finally { setUploading(false); }
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

                  <Card style={{ gap: spacing.md }}>
                    <Text style={styles.uploadTitle}>Bulk upload via Excel (.xlsx)</Text>
                    <Pressable testID="select-xlsx" onPress={pickFile} style={styles.selectBtn} disabled={!bucket.data}>
                      <FileArrowUp size={20} color={colors.brandPrimary} weight="bold" />
                      <Text style={styles.selectText} numberOfLines={1}>{file ? (file.name || "Selected file") : "Select .xlsx file"}</Text>
                    </Pressable>
                    {!!file && (
                      <View style={styles.fileRow}>
                        <CheckCircle size={16} color={colors.success} weight="fill" />
                        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                        <Pressable testID="clear-file" onPress={() => setFile(null)}><Text style={styles.removeText}>Remove</Text></Pressable>
                      </View>
                    )}
                    <Pressable testID="upload-xlsx" onPress={doUpload} style={[styles.actBtn, { backgroundColor: file ? colors.brandTertiary : colors.surfaceTertiary }]} disabled={!file || uploading || !bucket.data}>
                      <UploadSimple size={18} color={file ? "#FFFFFF" : colors.muted} weight="bold" />
                      <Text style={[styles.actText, !file && { color: colors.muted }]}>{uploading ? "Uploading…" : "Upload File"}</Text>
                    </Pressable>
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
  uploadTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.onSurface },
  selectBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, borderStyle: "dashed" },
  selectText: { flex: 1, color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.base },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fileName: { flex: 1, color: colors.onSurfaceSecondary, fontSize: fontSize.sm, fontWeight: "600" },
  removeText: { color: colors.error, fontWeight: "700", fontSize: fontSize.sm },
  errTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  metaRow: { flexDirection: "row", gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  empty: { color: colors.muted, textAlign: "center", fontSize: fontSize.base },
}));
