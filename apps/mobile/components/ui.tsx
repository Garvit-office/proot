import { markSvg, theme, wordmarkAspect, wordmarkSvg } from "@proot/shared";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
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

/** Scrolling page. Pass `onRefresh` to get pull-to-refresh (it should return a promise). */
export function Screen({
  children,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown> | void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <ScrollView
      style={ui.page}
      contentContainerStyle={[ui.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.brand} colors={[c.brand]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={ui.state}>
      <ActivityIndicator color={c.brand} />
      {label ? <Text style={ui.meta}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={ui.state}>
      <Text style={[ui.body, { textAlign: "center", color: c.bad }]} accessibilityRole="alert">{message}</Text>
      {onRetry ? <SmallButton label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Card style={{ padding: 24, alignItems: "center", gap: 6 }}>
      <Text style={[ui.title, { textAlign: "center" }]}>{title}</Text>
      {text ? <Text style={[ui.body, { textAlign: "center" }]}>{text}</Text> : null}
      {action}
    </Card>
  );
}

/** Inline error/notice banner. */
export function Notice({ children, tone = "bad" }: { children: ReactNode; tone?: "bad" | "good" | "warn" | "info" }) {
  const map = { bad: [c.badSoft, c.bad], good: [c.goodSoft, c.good], warn: [c.warnSoft, c.warn], info: [c.infoSoft, c.info] } as const;
  const [bg, fg] = map[tone];
  return (
    <Text style={[ui.notice, { backgroundColor: bg, color: fg }]} accessibilityRole={tone === "bad" ? "alert" : undefined}>
      {children}
    </Text>
  );
}

export function SmallButton({
  label,
  onPress,
  disabled,
  tone = "neutral",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "neutral" | "brand" | "bad";
  style?: StyleProp<ViewStyle>;
}) {
  const color = tone === "brand" ? c.brand : tone === "bad" ? c.bad : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [ui.small, tone === "brand" && { borderColor: c.brand }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={[ui.smallText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[ui.input, focused && { borderColor: c.brand }, error ? { borderColor: c.bad } : null, props.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }, style]}
      />
      {error ? <Text style={ui.error}>{error}</Text> : hint ? <Text style={ui.meta}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal, scrollable single-choice pills (categories, sorts, dates…). */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  labels,
  style,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0, marginBottom: 12 }, style]} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[ui.pill, on && ui.pillOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[ui.pillText, on && { color: c.brand }]}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={ui.segmented}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[ui.segment, value === o && ui.segmentOn]} accessibilityRole="tab" accessibilityState={{ selected: value === o }}>
          <Text style={[ui.pillText, value === o && { color: c.ink }]}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A tappable list row with a chevron and optional badge count. */
export function NavRow({ title, meta, onPress, badge }: { title: string; meta?: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ui.listItem, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.rowTitle}>{title}</Text>
        {meta ? <Text style={ui.meta}>{meta}</Text> : null}
      </View>
      {badge ? <Badge count={badge} /> : null}
      <Text style={[ui.meta, { fontSize: 18 }]}>›</Text>
    </Pressable>
  );
}

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (!count) return null;
  return (
    <View style={[ui.badge, style]}>
      <Text style={ui.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

/** Remote image with a soft placeholder when there is none. */
export function Photo({ uri, style, label }: { uri: string | null | undefined; style?: StyleProp<ViewStyle>; label?: string }) {
  if (!uri) {
    return (
      <View style={[{ backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, style]}>
        {label ? <Text style={[ui.meta, { fontFamily: fonts.sansBold }]}>{label}</Text> : null}
      </View>
    );
  }
  return <Image source={{ uri }} style={[{ backgroundColor: c.surface2 }, style as object]} accessibilityIgnoresInvertColors />;
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

/** Label / value summary row (totals, details). */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={strong ? ui.rowTitle : ui.body}>{label}</Text>
      <Text style={[strong ? ui.price : [ui.body, { color: c.ink }], { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
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
  rowTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: c.ink },
  state: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  notice: { padding: 12, marginBottom: 14, borderRadius: r.sm, overflow: "hidden", fontFamily: fonts.sansMedium, fontSize: 13.5 },
  small: { minWidth: 40, alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: r.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  smallText: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.ink },
  field: { gap: 6, marginBottom: 14 },
  label: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.inkSoft },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: r.sm,
    backgroundColor: c.surface,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: c.ink,
  },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: c.bad },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: r.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  pillOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  pillText: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.inkSoft },
  segmented: { flexDirection: "row", padding: 4, marginBottom: 18, borderRadius: r.pill, backgroundColor: c.surface2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: r.pill },
  segmentOn: { backgroundColor: c.surface },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.accent },
  badgeText: { fontFamily: fonts.sansBold, fontSize: 11, color: "#FFFFFF" },
  link: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.brand },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
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
