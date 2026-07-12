import React from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/context/ThemeContext";

export function Header() {
  const { theme } = useTheme();
  return <View style={styles.header}><Image source={require("../../assets/gdrpl-logo.png")} style={styles.logo} /><Text style={[styles.title, { color: theme.ink }]}>GDRPL Survey</Text></View>;
}
export function GlassCard({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const { theme, isDark } = useTheme();
  return <BlurView intensity={isDark ? 28 : 44} tint={isDark ? "dark" : "light"} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }, style]}>{children}</BlurView>;
}
export function Field(props: React.ComponentProps<typeof TextInput>) {
  const { theme } = useTheme();
  return <TextInput placeholderTextColor={theme.muted} style={[styles.field, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]} {...props} />;
}
export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { opacity: disabled ? .5 : pressed ? .8 : 1 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function Label({ children }: React.PropsWithChildren) { const { theme } = useTheme(); return <Text style={[styles.label, { color: theme.ink }]}>{children}</Text>; }
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  logo: { width: 34, height: 34, resizeMode: "contain" }, title: { fontWeight: "800", fontSize: 21 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, overflow: "hidden" }, field: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#1B4F8C", borderRadius: 12, padding: 14, alignItems: "center" }, buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
  label: { fontWeight: "700", marginBottom: 6, fontSize: 14 }
});
