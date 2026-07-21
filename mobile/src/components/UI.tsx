import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";

export function Header({
  subtitle,
  onBack,
  right,
}: {
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 10), borderBottomColor: theme.border }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={[styles.backBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.backText, { color: theme.accentPrimary }]}>←</Text>
        </Pressable>
      ) : null}
      <Image source={require("../../assets/gdrpl-logo.png")} style={styles.logo} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.ink }]}>GDRPL Survey</Text>
        {subtitle ? <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({
  children,
  subtitle,
  onBack,
  scroll = true,
  keyboard = false,
  right,
}: React.PropsWithChildren<{
  subtitle?: string;
  onBack?: () => void;
  scroll?: boolean;
  keyboard?: boolean;
  right?: React.ReactNode;
}>) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1, paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>
  );

  const framed = keyboard ? (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Header subtitle={subtitle} onBack={onBack} right={right} />
      {framed}
    </View>
  );
}

export function GlassCard({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const { theme, isDark } = useTheme();
  return (
    <BlurView
      intensity={isDark ? 28 : 48}
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

export function Label({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.ink }]}>{children}</Text>;
}

export function Hero({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.hero, { color: theme.ink }]}>{children}</Text>;
}

export function SectionTitle({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.ink }]}>{children}</Text>;
}

export function Body({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.body, { color: theme.cardText }]}>{children}</Text>;
}

export function Meta({ children }: React.PropsWithChildren) {
  const { theme } = useTheme();
  return <Text style={[styles.meta, { color: theme.muted }]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  disabled,
  disabledReason,
  variant = "primary",
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const palette =
    variant === "secondary"
      ? { bg: theme.surface, border: theme.accentPrimary, text: theme.accentPrimary }
      : variant === "danger"
        ? { bg: theme.danger, border: theme.danger, text: "#FFFFFF" }
        : variant === "ghost"
          ? { bg: "transparent", border: theme.border, text: theme.ink }
          : { bg: theme.accentPrimary, border: theme.accentPrimary, text: "#FFFFFF" };

  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) {
          Alert.alert("Cannot continue", disabledReason || "This action is not available right now.");
          return;
        }
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled || loading ? 0.5 : pressed ? 0.88 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={palette.text} /> : <Text style={[styles.buttonText, { color: palette.text }]}>{title}</Text>}
    </Pressable>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <GlassCard style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.meta, { color: theme.muted, textAlign: "center" }]}>{message}</Text>
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} /> : null}
    </GlassCard>
  );
}

export function StatusChip({ status }: { status: string }) {
  const { theme } = useTheme();
  const key = status.toLowerCase();
  const tone =
    key.includes("sync") && key.includes("pending")
      ? { bg: theme.warnSoft, fg: theme.warn }
      : key.includes("error") || key.includes("fail")
        ? { bg: theme.dangerSoft, fg: theme.danger }
        : key.includes("synced") || key.includes("completed") || key.includes("submitted")
          ? { bg: theme.successSoft, fg: theme.accentSecondary }
          : { bg: theme.surface, fg: theme.muted };
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg, borderColor: theme.border }]}>
      <Text style={[styles.chipText, { color: tone.fg }]}>{status}</Text>
    </View>
  );
}

export function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: selected ? theme.accentSecondary : theme.border,
          backgroundColor: selected ? theme.successSoft : theme.surface,
        },
      ]}
    >
      <Text style={{ color: theme.ink, fontWeight: selected ? "800" : "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 18, fontWeight: "800", marginTop: -1 },
  logo: { width: 34, height: 34, resizeMode: "contain" },
  title: { fontWeight: "800", fontSize: 18 },
  sub: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  content: { padding: 18, gap: 14 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, overflow: "hidden" },
  field: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 12 },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: "center",
  },
  buttonText: { fontWeight: "800", fontSize: 16 },
  label: { fontWeight: "700", marginBottom: 6, fontSize: 14 },
  hero: { fontSize: 24, fontWeight: "800", marginBottom: 10, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  body: { lineHeight: 22, marginBottom: 12, fontSize: 14 },
  meta: { lineHeight: 21, marginBottom: 10, fontSize: 13 },
  empty: { alignItems: "center", paddingVertical: 28, gap: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  chip: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
});
