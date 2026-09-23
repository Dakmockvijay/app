import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretLeft } from "phosphor-react-native";

import { makeStyles, spacing, fontSize } from "@/src/theme";

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
        <CaretLeft size={24} color="#FFFFFF" weight="bold" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    backgroundColor: colors.brandTertiary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backBtn: { padding: spacing.xs },
  title: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "900" },
  sub: { color: colors.brandSecondary, fontSize: fontSize.base, fontWeight: "700", marginTop: 2 },
}));
