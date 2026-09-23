import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ShieldCheck,
  Headset,
  SignOut,
  CaretRight,
  Ticket,
  CalendarCheck,
} from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { Card, Badge } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: () => api.get("/subscriptions") });
  const activeSubs: any[] = subs.data || [];

  const initials = (user?.name || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin && (
            <View style={{ marginTop: spacing.sm }}>
              <Badge label="ADMIN" color={colors.onBrandSecondary} bg={colors.brandSecondary} />
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Active Subscriptions</Text>
          {activeSubs.length === 0 ? (
            <Card>
              <Text style={styles.muted}>No active passes. Explore test series to get started.</Text>
            </Card>
          ) : (
            activeSubs.map((s, i) => (
              <Card key={i} style={styles.subRow}>
                <CalendarCheck size={22} color={colors.success} weight="fill" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.subTitle}>
                    {s.plan === "combo" ? "Combo Pass (All Exams)" : s.category_name}
                  </Text>
                  <Text style={styles.subDate}>
                    Valid till {new Date(s.active_until).toLocaleDateString()}
                  </Text>
                </View>
              </Card>
            ))
          )}

          <Text style={styles.sectionTitle}>Account</Text>
          {user?.is_admin && (
            <Pressable testID="nav-admin" onPress={() => router.push("/admin")}>
              <Card style={styles.linkRow}>
                <ShieldCheck size={22} color={colors.brandPrimary} weight="fill" />
                <Text style={styles.linkText}>Admin Panel</Text>
                <CaretRight size={18} color={colors.muted} />
              </Card>
            </Pressable>
          )}
          <Pressable testID="nav-support" onPress={() => router.push("/support")}>
            <Card style={styles.linkRow}>
              <Headset size={22} color={colors.info} weight="fill" />
              <Text style={styles.linkText}>Help & Support</Text>
              <CaretRight size={18} color={colors.muted} />
            </Card>
          </Pressable>
          <Pressable testID="nav-wallet" onPress={() => router.push("/(tabs)/wallet")}>
            <Card style={styles.linkRow}>
              <Ticket size={22} color={colors.brandSecondary} weight="fill" />
              <Text style={styles.linkText}>Referrals & Tokens ({user?.token_balance ?? 0})</Text>
              <CaretRight size={18} color={colors.muted} />
            </Card>
          </Pressable>

          <Pressable testID="logout-btn" onPress={signOut}>
            <Card style={[styles.linkRow, { marginTop: spacing.lg }]}>
              <SignOut size={22} color={colors.error} weight="fill" />
              <Text style={[styles.linkText, { color: colors.error }]}>Log Out</Text>
            </Card>
          </Pressable>

          <Text style={styles.version}>DakMock v1.0 · dakmock.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.brandSecondary,
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: fontSize.xxl, fontWeight: "900" },
  name: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "900", marginTop: spacing.md },
  email: { color: "#CBD5E1", fontSize: fontSize.base, marginTop: 2 },
  body: { padding: spacing.xl, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  muted: { color: colors.muted, fontSize: fontSize.base },
  subRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  subTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.onSurface },
  subDate: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  linkText: { flex: 1, fontSize: fontSize.lg, fontWeight: "700", color: colors.onSurface },
  version: { textAlign: "center", color: colors.muted, fontSize: fontSize.sm, marginTop: spacing.xl },
}));
