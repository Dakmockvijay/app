import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { Loading, EmptyState } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

const TITLES: Record<string, string> = {
  terms: "Terms & Conditions",
  refund: "Refund Policy",
  privacy: "Privacy Policy",
};

export default function PolicyView() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type: string }>();
  const policies = useQuery({ queryKey: ["policies"], queryFn: () => api.get("/policies") });

  const key = (type || "terms") as keyof typeof TITLES;
  const content = policies.data?.[key];

  return (
    <View style={styles.root}>
      <ScreenHeader title={TITLES[key] || "Policy"} />
      {policies.isLoading ? (
        <Loading />
      ) : content ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
          <Text style={styles.body}>{content}</Text>
        </ScrollView>
      ) : (
        <EmptyState title="Not available yet" subtitle="This policy has not been published by the admin." />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { color: colors.onSurface, fontSize: fontSize.base, lineHeight: 24 },
}));
