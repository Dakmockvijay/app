import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EnvelopeSimple } from "phosphor-react-native";

import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { AppButton, Field } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fontSize } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1554672408-17407e0322ce?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwdGFraW5nJTIwb25saW5lJTIwZXhhbSUyMG9uJTIwbW9iaWxlJTIwcGhvbmV8ZW58MHx8fHwxNzkwMTcxNDc3fDA&ixlib=rb-4.1.0&q=85";

export default function LoginScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim() || (mode === "signup" && !name.trim())) {
      toast.show("Please fill all required fields", "error");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await signIn(email.trim().toLowerCase(), password);
      else await signUp(name.trim(), email.trim().toLowerCase(), password, referral.trim());
    } catch (e: any) {
      toast.show(e.message || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      toast.show(e.message || "Google sign-in failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" transition={300} />
          <View style={styles.heroScrim} />
          <View style={styles.heroText}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>DAK</Text>
            </View>
            <Text style={styles.heroTitle}>DakMock</Text>
            <Text style={styles.heroSub}>India Post departmental exam prep, done right.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Pressable
              testID="tab-login"
              onPress={() => setMode("login")}
              style={[styles.switchBtn, mode === "login" && styles.switchActive]}
            >
              <Text style={[styles.switchText, mode === "login" && styles.switchTextActive]}>
                Login
              </Text>
            </Pressable>
            <Pressable
              testID="tab-signup"
              onPress={() => setMode("signup")}
              style={[styles.switchBtn, mode === "signup" && styles.switchActive]}
            >
              <Text style={[styles.switchText, mode === "signup" && styles.switchTextActive]}>
                Sign Up
              </Text>
            </Pressable>
          </View>

          {mode === "signup" && (
            <Field
              label="Full Name"
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              testID="input-name"
            />
          )}
          <Field
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            testID="input-email"
          />
          <Field
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="input-password"
          />
          {mode === "signup" && (
            <Field
              label="Referral Code (optional)"
              placeholder="DAKXXXXXX"
              autoCapitalize="characters"
              value={referral}
              onChangeText={setReferral}
              testID="input-referral"
            />
          )}

          <AppButton
            title={mode === "login" ? "Login" : "Create Account"}
            onPress={submit}
            loading={busy}
            testID="submit-auth"
          />

          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.line} />
          </View>

          <AppButton
            title="Continue with Google"
            variant="outline"
            onPress={google}
            disabled={busy}
            testID="google-signin"
            icon={<EnvelopeSimple size={20} color={colors.brandPrimary} weight="bold" />}
          />

          <Text style={styles.terms}>
            1-Year validity on all passes • Secure payments via Razorpay
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  heroWrap: { height: 300, width: "100%", justifyContent: "flex-end" },
  hero: { ...{ position: "absolute" }, width: "100%", height: "100%" },
  heroScrim: { ...{ position: "absolute" }, width: "100%", height: "100%", backgroundColor: "rgba(0,33,71,0.55)" },
  heroText: { padding: spacing.xl, gap: spacing.xs },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoBadgeText: { color: colors.onBrandPrimary, fontWeight: "900", fontSize: fontSize.lg },
  heroTitle: { color: "#FFFFFF", fontSize: 34, fontWeight: "900" },
  heroSub: { color: "#E2E8F0", fontSize: fontSize.base },
  card: {
    marginTop: -24,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  switchRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  switchBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  switchActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  switchText: { fontSize: fontSize.base, fontWeight: "700", color: colors.muted },
  switchTextActive: { color: colors.brandPrimary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: "600" },
  terms: { color: colors.muted, fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.md },
}));
