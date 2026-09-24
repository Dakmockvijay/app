import React, { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, PencilSimple, Trash, Clock, ListChecks } from "phosphor-react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminSeriesTests() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const tests = useQuery({ queryKey: ["admin-series-tests", id], queryFn: () => api.get(`/admin/test-series/${id}/tests`) });
  const [confirmDel, setConfirmDel] = useState<any | null>(null);

  const doDelete = async () => {
    try {
      await api.del(`/admin/tests/${confirmDel.test_id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-series-tests", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
      toast.show("Test deleted", "success");
    } catch (e: any) { toast.show(e.message, "error"); } finally { setConfirmDel(null); }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Manage Tests" subtitle={`${(tests.data || []).length} tests in series`} />
      {tests.isLoading ? <Loading /> : (
        <FlatList
          data={tests.data || []}
          keyExtractor={(t: any) => t.test_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 90, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>No tests yet. Tap Add Test to create one.</Text>}
          renderItem={({ item }) => (
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.rowTop}>
                <Text style={styles.title}>{item.title}</Text>
                {!!item.paper && <Badge label={item.paper} color={colors.onBrandSecondary} bg={colors.brandSecondary} />}
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}><Clock size={14} color={colors.muted} /><Text style={styles.meta}>{item.duration_min} min</Text></View>
                <View style={styles.metaItem}><ListChecks size={14} color={colors.muted} /><Text style={styles.meta}>{item.question_count} Qs</Text></View>
              </View>
              <View style={styles.actions}>
                <Pressable testID={`edit-test-${item.test_id}`} onPress={() => router.push(`/admin/test-editor?testId=${item.test_id}`)} style={styles.iconBtn}>
                  <PencilSimple size={18} color={colors.info} weight="bold" />
                  <Text style={styles.iconText}>Edit questions</Text>
                </Pressable>
                <Pressable testID={`del-test-${item.test_id}`} onPress={() => setConfirmDel(item)} style={styles.iconBtn}>
                  <Trash size={18} color={colors.error} weight="bold" />
                  <Text style={[styles.iconText, { color: colors.error }]}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      <Pressable testID="add-test-btn" onPress={() => router.push(`/admin/test-editor?seriesId=${id}`)} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>Add Test</Text>
      </Pressable>

      <Modal visible={!!confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete test?</Text>
            <Text style={styles.confirmText}>{confirmDel?.title} will be removed for students.</Text>
            <View style={styles.confirmActions}>
              <Pressable testID="cancel-del-test" onPress={() => setConfirmDel(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable testID="confirm-del-test" onPress={doDelete} style={styles.delBtn}><Text style={styles.delText}>Delete</Text></Pressable>
            </View>
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
  metaRow: { flexDirection: "row", gap: spacing.lg },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.info },
  fab: { position: "absolute", right: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: fontSize.base },
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
