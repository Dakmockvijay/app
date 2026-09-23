import React from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { Card, Loading, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function AdminUsers() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get("/admin/users") });

  return (
    <View style={styles.root}>
      <ScreenHeader title="User Management" subtitle={`${(users.data || []).length} users`} />
      {users.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={users.data || []}
          keyExtractor={(u: any) => u.user_id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.email}>{item.email}</Text>
                </View>
                {item.is_admin && <Badge label="ADMIN" color={colors.onBrandSecondary} bg={colors.brandSecondary} />}
              </View>
              <View style={styles.metaRow}>
                <Meta label="Code" value={item.referral_code} />
                <Meta label="Tokens" value={String(item.token_balance)} />
                <Meta label="Subs" value={String(item.active_subscriptions)} />
                <Meta label="Tests" value={String(item.attempts)} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      <Text style={styles.metaVal}>{value}</Text>
      <Text style={styles.metaLbl}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: { gap: spacing.md },
  rowTop: { flexDirection: "row", alignItems: "center" },
  name: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface },
  email: { fontSize: fontSize.base, color: colors.muted, marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  meta: { alignItems: "center", flex: 1 },
  metaVal: { fontSize: fontSize.base, fontWeight: "800", color: colors.brandPrimary },
  metaLbl: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
}));
