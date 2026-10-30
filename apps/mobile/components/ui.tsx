import { markSvg, theme, wordmarkAspect, wordmarkSvg } from "@proot/shared";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SvgXml } from "react-native-svg";

export const c = theme.colors;
export const r = theme.radius;

// Inter weights registered in app/_layout.tsx — the one typeface used across Proot.
export const fonts = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  heading: "Inter_700Bold",
  headingHeavy: "Inter_800ExtraBold",
};

const wordmark = { light: wordmarkSvg("light"), dark: wordmarkSvg("dark") };
const mark = markSvg();

export function Logo({ height = 26, variant = "light" }: { height?: number; variant?: "light" | "dark" }) {
  return <SvgXml xml={wordmark[variant]} height={height} width={height * wordmarkAspect} accessibilityLabel="Proot" />;
}

export function Mark({ size = 84 }: { size?: number }) {
  return <SvgXml xml={mark} width={size} height={size} accessibilityLabel="Proot" />;
}

export type Tone = "neutral" | "brand" | "accent" | "good" | "warn" | "bad";

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: c.surface2, fg: c.inkSoft },
  brand: { bg: c.brandSoft, fg: c.brand },
  accent: { bg: c.accentSoft, fg: c.accentInk },
  good: { bg: c.goodSoft, fg: c.good },
  warn: { bg: c.warnSoft, fg: c.warn },
  bad: { bg: c.badSoft, fg: c.bad },
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={ui.page} contentContainerStyle={ui.content}>
      {children}
    </ScrollView>
  );
}

export function PageHead({ eyebrow, title, lede }: { eyebrow?: string; title: string; lede?: string }) {
  return (
    <View style={ui.head}>
      {eyebrow ? <Text style={ui.eyebrow}>{eyebrow}</Text> : null}
      <Text style={ui.h1}>{title}</Text>
      {lede ? <Text style={ui.lede}>{lede}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[ui.eyebrow, ui.section, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function Chip({ children, tone = "neutral", style }: { children: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = toneColors[tone];
  return (
    <View style={[ui.chip, { backgroundColor: t.bg }, style]}>
      <Text style={[ui.chipText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  variant = "primary",
  style,
  ...props
}: PressableProps & { label: string; variant?: "primary" | "secondary"; style?: StyleProp<ViewStyle> }) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        ui.button,
        primary ? ui.buttonPrimary : ui.buttonSecondary,
        pressed && { opacity: 0.85 },
        props.disabled && { opacity: 0.5 },
        style,
      ]}
      {...props}
    >
      <Text style={[ui.buttonText, { color: primary ? "#FFFFFF" : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  content: { padding: 20, paddingBottom: 56 },
  head: { marginBottom: 20 },
  eyebrow: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: c.brand },
  section: { marginTop: 28, marginBottom: 12 },
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 37, letterSpacing: -0.8, color: c.ink, marginTop: 8 },
  lede: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: c.muted, marginTop: 10 },
  title: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, letterSpacing: -0.3, color: c.ink },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: c.muted },
  meta: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: c.muted },
  price: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.md,
    overflow: "hidden",
    marginBottom: 16,
  },
  cardImage: { width: "100%", height: 200, backgroundColor: c.surface2 },
  cardBody: { padding: 16, gap: 6 },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  overlayChip: { position: "absolute", top: 12, left: 12, backgroundColor: "rgba(255,255,255,0.94)" },
  chip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: r.pill },
  chipText: { fontFamily: fonts.sansSemi, fontSize: 11.5 },
  button: { flex: 1, minHeight: 48, borderRadius: r.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  buttonPrimary: { backgroundColor: c.brand },
  buttonSecondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong },
  buttonText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  row: { flexDirection: "row", gap: 10 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.sm + 4,
    marginBottom: 8,
  },
});
