import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { AppButton, Field } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, fontSize } from "@/src/theme";

// Reusable change-password sheet used by both Admin and User (Profile) screens.
export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); };

  const submit = async () => {
    if (!current || !next) { toast.show("Fill all fields", "error"); return; }
    if (next.length < 6) { toast.show("New password must be at least 6 characters", "error"); return; }
    if (next !== confirm) { toast.show("New passwords do not match", "error"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.show("Password changed successfully", "success");
      reset();
      onClose();
    } catch (e: any) {
      toast.show(e.message || "Could not change password", "error");
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Change Password</Text>
            <Pressable testID="close-change-pw" onPress={onClose} hitSlop={12}><X size={24} color={colors.onSurface} /></Pressable>
          </View>
          <Field label="Current Password" secureTextEntry value={current} onChangeText={setCurrent} testID="cp-current" />
          <Field label="New Password" secureTextEntry value={next} onChangeText={setNext} testID="cp-new" />
          <Field label="Confirm New Password" secureTextEntry value={confirm} onChangeText={setConfirm} testID="cp-confirm" />
          <AppButton title="Update Password" onPress={submit} loading={busy} testID="cp-submit" />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  overlay: { flex: 1, backgroundColor: "rgba(10,17,40,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, gap: spacing.xs },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: "900", color: colors.onSurface },
}));
