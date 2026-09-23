import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { EnvelopeSimple } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { AppButton, Card, Field } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

export default function Support() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ["support-config"], queryFn: () => api.get("/support-config") });

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const email = cfg.data?.support_email || "support@dakmock.com";

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.show("Please fill subject and message", "error");
      return;
    }
    setBusy(true);
    try {
      await api.post("/support-tickets", { subject: subject.trim(), message: message.trim() });
      toast.show("Ticket submitted. We'll get back to you soon!", "success");
      setSubject("");
      setMessage("");
    } catch (e: any) {
      toast.show(e.message || "Failed to submit", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Help & Support" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.emailCard}>
          <EnvelopeSimple size={24} color={colors.brandPrimary} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.emailLabel}>Official Support Email</Text>
            <Text style={styles.email} onPress={() => Linking.openURL(`mailto:${email}`)} testID="support-email">
              {email}
            </Text>
          </View>
        </Card>

        <Text style={styles.heading}>Raise a Query</Text>
        <Field label="Subject" placeholder="e.g. Payment issue" value={subject} onChangeText={setSubject} testID="ticket-subject" />
        <Field
          label="Message"
          placeholder="Describe your issue…"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={5}
          style={{ minHeight: 120, textAlignVertical: "top", paddingTop: spacing.md }}
          testID="ticket-message"
        />
        <AppButton title="Submit Ticket" onPress={submit} loading={busy} testID="submit-ticket" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  emailCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  emailLabel: { fontSize: fontSize.sm, color: colors.muted, fontWeight: "600" },
  email: { fontSize: fontSize.lg, fontWeight: "800", color: colors.brandPrimary, marginTop: 2 },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
}));
