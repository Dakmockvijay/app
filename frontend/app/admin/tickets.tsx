import React from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function AdminTickets() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api.get("/admin/tickets") });

  return (
    <View style={styles.root}>
      <ScreenHeader title="Support Tickets" subtitle={`${(tickets.data || []).length} queries`} />
      {tickets.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={tickets.data || []}
          keyExtractor={(t: any) => t.ticket_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>No support tickets yet.</Text>}
          renderItem={({ item }) => (
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.rowTop}>
                <Text style={styles.subject}>{item.subject}</Text>
                <Badge label={item.status} color={colors.onWarning} bg={colors.warning} />
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <View style={styles.footer}>
                <Text style={styles.from}>{item.user_name} · {item.user_email}</Text>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subject: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  message: { fontSize: fontSize.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  footer: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  from: { fontSize: fontSize.sm, color: colors.muted },
  date: { fontSize: fontSize.sm, color: colors.muted },
}));
