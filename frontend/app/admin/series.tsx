import React, { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, PencilSimple, Trash, CaretRight, X } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminSeries() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const series = useQuery({ queryKey: ["admin-series"], queryFn: () => api.get("/admin/test-series") });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories") });

  const [editing, setEditing] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState("gds_mts");
  const [isFree, setIsFree] = useState(false);
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing({ series_id: null });
    setTitle(""); setDesc(""); setCatId(cats.data?.[0]?.category_id || "gds_mts"); setIsFree(false);
  };
  const openEdit = (s: any) => {
    setEditing(s);
    setTitle(s.title); setDesc(s.description || ""); setCatId(s.category_id); setIsFree(s.is_free);
  };

  const save = async () => {
    if (!title.trim()) { toast.show("Enter a title", "error"); return; }
    setBusy(true);
    try {
      if (editing?.series_id) {
        await api.put(`/admin/test-series/${editing.series_id}`, { title: title.trim(), description: desc.trim(), category_id: catId, is_free: isFree });
      } else {
        await api.post("/admin/test-series", { title: title.trim(), description: desc.trim(), category_id: catId, is_free: isFree });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
      setEditing(null);
      toast.show("Series saved", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const doDelete = async () => {
    try {
      await api.del(`/admin/test-series/${confirmDel.series_id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
      queryClient.invalidateQueries({ queryKey: ["test-series"] });
      toast.show("Series deleted", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setConfirmDel(null); }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Test Series" subtitle="Create, edit & manage series" />
      {series.isLoading ? <Loading /> : (
        <FlatList
          data={series.data || []}
          keyExtractor={(s: any) => s.series_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 90, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable testID={`admin-series-${item.series_id}`} onPress={() => router.push(`/admin/series/${item.series_id}`)}>
              <Card style={{ gap: spacing.sm }}>
                <View style={styles.rowTop}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.is_free
                    ? <Badge label="FREE" color={colors.onSuccess} bg={colors.success} />
                    : <Badge label="PAID" color={colors.onBrandSecondary} bg={colors.brandSecondary} />}
                </View>
                <Text style={styles.meta}>{item.category_name} · {item.test_count} tests</Text>
                <View style={styles.actions}>
                  <Pressable testID={`edit-series-${item.series_id}`} onPress={() => openEdit(item)} style={styles.iconBtn}>
                    <PencilSimple size={18} color={colors.info} weight="bold" />
                    <Text style={styles.iconText}>Edit</Text>
                  </Pressable>
                  <Pressable testID={`del-series-${item.series_id}`} onPress={() => setConfirmDel(item)} style={styles.iconBtn}>
                    <Trash size={18} color={colors.error} weight="bold" />
                    <Text style={[styles.iconText, { color: colors.error }]}>Delete</Text>
                  </Pressable>
                  <View style={styles.manageRow}>
                    <Text style={styles.manageText}>Manage tests</Text>
                    <CaretRight size={16} color={colors.brandPrimary} weight="bold" />
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      <Pressable testID="new-series-btn" onPress={openNew} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>New Series</Text>
      </Pressable>

      {/* Create/Edit modal */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing?.series_id ? "Edit Series" : "New Series"}</Text>
              <Pressable testID="close-series-modal" onPress={() => setEditing(null)} hitSlop={12}><X size={24} color={colors.onSurface} /></Pressable>
            </View>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. PA/SA Full Mock Series" testID="series-title" />
            <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Short description" testID="series-desc" />
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(cats.data || []).map((c: any) => (
                <Pressable key={c.category_id} testID={`cat-${c.category_id}`} onPress={() => setCatId(c.category_id)} style={[styles.chip, catId === c.category_id && styles.chipActive]}>
                  <Text style={[styles.chipText, catId === c.category_id && styles.chipTextActive]}>{c.short}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable testID="toggle-free" onPress={() => setIsFree((v) => !v)} style={styles.freeRow}>
              <Text style={styles.label}>Free series (no purchase needed)</Text>
              <View style={[styles.switch, isFree && styles.switchOn]}><View style={[styles.knob, isFree && styles.knobOn]} /></View>
            </Pressable>
            <AppButton title="Save Series" onPress={save} loading={busy} testID="save-series" style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={!!confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete series?</Text>
            <Text style={styles.confirmText}>{confirmDel?.title} and its tests will be hidden from students.</Text>
            <View style={styles.confirmActions}>
              <Pressable testID="cancel-del" onPress={() => setConfirmDel(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable testID="confirm-del" onPress={doDelete} style={styles.delBtn}><Text style={styles.delText}>Delete</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  meta: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.info },
  manageRow: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  manageText: { fontSize: fontSize.sm, fontWeight: "800", color: colors.brandPrimary },
  fab: { position: "absolute", right: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  label: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurfaceSecondary, marginBottom: spacing.sm },
  chipRow: { gap: spacing.sm, marginBottom: spacing.md },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onBrandPrimary },
  freeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, padding: 3 },
  switchOn: { backgroundColor: colors.brandPrimary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, width: "100%", maxWidth: 400 },
  confirmTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  confirmText: { fontSize: fontSize.base, color: colors.muted },
  confirmActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  cancelText: { color: colors.onSurfaceSecondary, fontWeight: "800" },
  delBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.error, alignItems: "center" },
  delText: { color: colors.onError, fontWeight: "800" },
}));
