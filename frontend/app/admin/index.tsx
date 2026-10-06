import React from "react";
import { Pressable, ScrollView, Text, View, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Users,
  UploadSimple,
  Tag,
  Coins,
  ChatCircleDots,
  CaretRight,
  BookOpen,
  Megaphone,
  Gift,
  FileText,
  FolderSimple,
} from "phosphor-react-native";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { Card, Loading } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

export default function AdminHome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get("/admin/stats") });

  const s = stats.data || {};

  const tiles = [
    { key: "manage", label: "Manage Tests", icon: <BookOpen size={26} color={colors.brandPrimary} weight="fill" />, route: "/admin/manage", count: s.tests },
    { key: "series", label: "Series Library", icon: <FolderSimple size={26} color={colors.info} weight="fill" />, route: "/admin/series", count: s.test_series },
    { key: "users", label: "User Management", icon: <Users size={26} color={colors.brandTertiary} weight="fill" />, route: "/admin/users", count: s.users },
    { key: "announcements", label: "Announcements", icon: <Megaphone size={26} color={colors.warning} weight="fill" />, route: "/admin/announcements" },
    { key: "upload", label: "Bulk Test Upload", icon: <UploadSimple size={26} color={colors.info} weight="fill" />, route: "/admin/upload", count: s.tests },
    { key: "policies", label: "Policy Pages", icon: <FileText size={26} color={colors.brandTertiary} weight="fill" />, route: "/admin/policies" },
    { key: "pricing", label: "Pricing & Gateway", icon: <Tag size={26} color={colors.success} weight="fill" />, route: "/admin/pricing" },
    { key: "referral", label: "Referral Settings", icon: <Gift size={26} color={colors.brandPrimary} weight="fill" />, route: "/admin/referral" },
    { key: "payouts", label: "Payout Requests", icon: <Coins size={26} color={colors.warning} weight="fill" />, route: "/admin/payouts", count: s.pending_payouts, badge: s.pending_payouts },
    { key: "tickets", label: "Support Tickets", icon: <ChatCircleDots size={26} color={colors.brandTertiary} weight="fill" />, route: "/admin/tickets", count: s.open_tickets, badge: s.open_tickets },
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader title="Admin Panel" subtitle="Manage DakMock" />
      {stats.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={stats.isFetching && !stats.isLoading} onRefresh={() => stats.refetch()} tintColor={colors.brandPrimary} />}
        >
          <View style={styles.statRow}>
            <View style={styles.statBox}><Text style={styles.statNum}>{s.users ?? 0}</Text><Text style={styles.statLbl}>Users</Text></View>
            <View style={styles.statBox}><Text style={styles.statNum}>{s.active_subscriptions ?? 0}</Text><Text style={styles.statLbl}>Active Subs</Text></View>
            <View style={styles.statBox}><Text style={styles.statNum}>{s.attempts ?? 0}</Text><Text style={styles.statLbl}>Attempts</Text></View>
          </View>

          <Text style={styles.sectionTitle}>Modules</Text>
          {tiles.map((t) => (
            <Pressable key={t.key} testID={`admin-tile-${t.key}`} onPress={() => router.push(t.route as any)}>
              <Card style={styles.tile}>
                <View style={styles.tileIcon}>{t.icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileLabel}>{t.label}</Text>
                  {t.count !== undefined && <Text style={styles.tileCount}>{t.count} total</Text>}
                </View>
                {!!t.badge && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{t.badge}</Text></View>
                )}
                <CaretRight size={20} color={colors.muted} />
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  statRow: { flexDirection: "row", gap: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { fontSize: fontSize.xxl, fontWeight: "900", color: colors.brandPrimary },
  statLbl: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600", marginTop: 2 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  tile: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  tileCount: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.onError, fontWeight: "800", fontSize: fontSize.sm },
}));
