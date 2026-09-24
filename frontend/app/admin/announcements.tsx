import React, { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, PencilSimple, Trash, X } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminAnnouncements() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const list = useQuery({ queryKey: ["admin-announcements"], queryFn: () => api.get("/admin/announcements") });

  const [editing, setEditing] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setEditing({ announcement_id: null }); setTitle(""); setMessage(""); setActive(true); };
  const openEdit = (a: any) => { setEditing(a); setTitle(a.title); setMessage(a.message); setActive(a.active); };

  const save = async () => {
    if (!title.trim() || !message.trim()) { toast.show("Enter title and message", "error"); return; }
    setBusy(true);
    try {
      const body = { title: title.trim(), message: message.trim(), active };
      if (editing?.announcement_id) await api.put(`/admin/announcements/${editing.announcement_id}`, body);
      else await api.post("/admin/announcements", body);
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      setEditing(null);
      toast.show("Announcement saved — students will see it as a popup", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setBusy(false); }
  };

  const toggle = async (a: any) => {
    try {
      await api.put(`/admin/announcements/${a.announcement_id}`, { title: a.title, message: a.message, active: !a.active });
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const remove = async (a: any) => {
    try {
      await api.del(`/admin/announcements/${a.announcement_id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.show("Deleted", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Announcements" subtitle="Popup shown to students" />
      {list.isLoading ? <Loading /> : (
        <FlatList
          data={list.data || []}
          keyExtractor={(a: any) => a.announcement_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 90, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
          renderItem={({ item }) => (
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.rowTop}>
                <Text style={styles.title}>{item.title}</Text>
                <Pressable testID={`toggle-ann-${item.announcement_id}`} onPress={() => toggle(item)}>
                  <Badge label={item.active ? "LIVE" : "OFF"} color={item.active ? colors.onSuccess : colors.onSurfaceTertiary} bg={item.active ? colors.success : colors.surfaceTertiary} />
                </Pressable>
              </View>
              <Text style={styles.msg}>{item.message}</Text>
              <View style={styles.actions}>
                <Pressable testID={`edit-ann-${item.announcement_id}`} onPress={() => openEdit(item)} style={styles.iconBtn}>
                  <PencilSimple size={18} color={colors.info} weight="bold" /><Text style={styles.iconText}>Edit</Text>
                </Pressable>
                <Pressable testID={`del-ann-${item.announcement_id}`} onPress={() => remove(item)} style={styles.iconBtn}>
                  <Trash size={18} color={colors.error} weight="bold" /><Text style={[styles.iconText, { color: colors.error }]}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      <Pressable testID="new-ann-btn" onPress={openNew} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" /><Text style={styles.fabText}>New</Text>
      </Pressable>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing?.announcement_id ? "Edit" : "New"} Announcement</Text>
              <Pressable testID="close-ann" onPress={() => setEditing(null)} hitSlop={12}><X size={24} color={colors.onSurface} /></Pressable>
            </View>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. New mock series live!" testID="ann-title" />
            <Field label="Message" value={message} onChangeText={setMessage} placeholder="Details students will read…" multiline style={{ minHeight: 100, textAlignVertical: "top", paddingTop: spacing.md }} testID="ann-message" />
            <Pressable testID="ann-active" onPress={() => setActive((v) => !v)} style={styles.freeRow}>
              <Text style={styles.label}>Show to students (active)</Text>
              <View style={[styles.switch, active && styles.switchOn]}><View style={[styles.knob, active && styles.knobOn]} /></View>
            </Pressable>
            <AppButton title="Save" onPress={save} loading={busy} testID="save-ann" style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  msg: { fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  actions: { flexDirection: "row", gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.info },
  fab: { position: "absolute", right: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, elevation: 6 },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
  label: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurfaceSecondary },
  freeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, padding: 3 },
  switchOn: { backgroundColor: colors.brandPrimary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
}));
