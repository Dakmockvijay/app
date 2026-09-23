import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export function AppButton({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
  icon,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg = {
    primary: colors.brandPrimary,
    secondary: colors.brandSecondary,
    outline: "transparent",
    ghost: "transparent",
    danger: colors.error,
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    secondary: colors.onBrandSecondary,
    outline: colors.brandPrimary,
    ghost: colors.onSurfaceSecondary,
    danger: colors.onError,
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: colors.brandPrimary,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center} testID="loading-state">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      {!!label && <Text style={styles.muted}>{label}</Text>}
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.center} testID="empty-state">
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.muted}>{subtitle}</Text>}
      {!!action && <View style={{ marginTop: spacing.lg }}>{action}</View>}
    </View>
  );
}

export function Badge({
  label,
  color,
  bg,
  testID,
}: {
  label: string;
  color: string;
  bg: string;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontSize: fontSize.lg, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0A1128",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  muted: { color: colors.muted, fontSize: fontSize.base, textAlign: "center" },
  emptyTitle: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: "700", textAlign: "center" },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, alignSelf: "flex-start" },
  badgeText: { fontSize: fontSize.sm, fontWeight: "700" },
}));
