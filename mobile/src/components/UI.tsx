import React from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/context/ThemeContext";

export function Header({ subtitle }: { subtitle?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      <Image source={require("../../assets/gdrpl-logo.png")} style={styles.logo} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.ink }]}>GDRPL Survey</Text>
        {subtitle ? <Text style={[styles.sub, { color: theme.muted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function GlassCard({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const { theme, isDark } = useTheme();
  return (
    <BlurView
      intensity={isDark ? 28 : 44}
      tint={isDark ? "dark" : "light"}
      style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }, style]}
    >
      {children}
    </BlurView>
  );
}

export function Field(props: React.ComponentProps<typeof TextInput>) {
  const { theme } = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      style={[styles.field, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]}
      {...props}
    />
  );
}

export function Button({
  title,
  onPress,
  disabled,
  disabledReason,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) {
          Alert.alert("Cannot continue", disabledReason || "This action is not available right now.");
          return;
        }
        onPress();
      }}
      style={({ pressed }) => [styles.button, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function Label({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.ink }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  logo: { width: 34, height: 34, resizeMode: "contain" },
  title: { fontWeight: "800", fontSize: 18 },
  sub: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, overflow: "hidden" },
  field: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#1B4F8C", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
  label: { fontWeight: "700", marginBottom: 6, fontSize: 14 },
});
