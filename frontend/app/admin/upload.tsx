import React, { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { FileXls, DownloadSimple, CheckCircle } from "phosphor-react-native";

import { api, loadToken } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

const COLUMNS = [
  "Question Text (EN)", "Question Text (HI)",
  "Option A/B/C/D (EN)", "Option A/B/C/D (HI)",
  "Correct Answer (A/B/C/D)", "Explanation (EN)", "Explanation (HI)",
  "Exam Category", "Test Name", "Time Limit (min)", "Marks",
];

export default function AdminUpload() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tests: number; questions: number } | null>(null);

  const downloadTemplate = async () => {
    try {
      const token = await loadToken();
      const url = `${api.baseUrl}/api/admin/sample-template`;
      if (Platform.OS === "web") {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = "dakmock_template.xlsx";
        link.click();
        toast.show("Template downloaded", "success");
      } else {
        toast.show("Open the web admin to download the .xlsx template", "info");
      }
    } catch (e: any) {
      toast.show(e.message || "Download failed", "error");
    }
  };

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setBusy(true);
      setResult(null);
      const form = new FormData();
      if (Platform.OS === "web" && (asset as any).file) {
        form.append("file", (asset as any).file);
      } else {
        form.append("file", {
          uri: asset.uri,
          name: asset.name || "upload.xlsx",
          type: asset.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        } as any);
      }
      const out = await api.uploadFile("/admin/bulk-upload", form);
      setResult({ tests: out.tests_created, questions: out.questions_created });
      toast.show(`Uploaded ${out.tests_created} tests, ${out.questions_created} questions`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Bulk Test Upload" subtitle="Import questions via .xlsx" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
      >
        <Card style={styles.dropZone}>
          <FileXls size={48} color={colors.success} weight="fill" />
          <Text style={styles.dropTitle}>Upload Excel (.xlsx)</Text>
          <Text style={styles.dropHint}>
            Rows with the same Test Name & Exam Category are grouped into one test.
          </Text>
          <AppButton title="Select & Upload File" onPress={pickAndUpload} loading={busy} testID="pick-upload" style={{ marginTop: spacing.md, alignSelf: "stretch" }} />
        </Card>

        {result && (
          <Card style={styles.resultCard}>
            <CheckCircle size={22} color={colors.success} weight="fill" />
            <Text style={styles.resultText}>
              Created {result.tests} test(s) with {result.questions} question(s).
            </Text>
          </Card>
        )}

        <Card>
          <View style={styles.tplHeader}>
            <Text style={styles.heading}>Sample Template</Text>
            <AppButton
              title="Download"
              variant="outline"
              onPress={downloadTemplate}
              testID="download-template"
              icon={<DownloadSimple size={18} color={colors.brandPrimary} weight="bold" />}
              style={{ minHeight: 40, paddingHorizontal: spacing.md }}
            />
          </View>
          <Text style={styles.hint}>Required columns:</Text>
          <View style={styles.colList}>
            {COLUMNS.map((c) => (
              <View key={c} style={styles.colChip}>
                <Text style={styles.colText}>{c}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>Exam Category values: gds_mts, postman_mailguard, pa_sa</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  dropZone: {
    alignItems: "center",
    gap: spacing.sm,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  dropTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  dropHint: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  resultCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: "#E7F6EE", borderColor: colors.success },
  resultText: { flex: 1, color: colors.onSurface, fontWeight: "700", fontSize: fontSize.base },
  tplHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  colList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  colChip: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  colText: { fontSize: fontSize.sm, color: colors.onSurfaceSecondary, fontWeight: "600" },
}));
