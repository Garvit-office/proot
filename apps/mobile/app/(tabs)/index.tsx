import { parks, todayActivity, userPet } from "@proot/shared";
import { Link, type Href } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { c, Chip, fonts, PageHead, r, Screen, SectionLabel, ui } from "@/components/ui";
import { useSession } from "@/lib/session";

const stats = [
  { label: "Walk", value: "2.1 km", meta: "today" },
  { label: "Meals", value: "310 kcal", meta: "logged" },
  { label: "Nearby", value: `${parks[0].dogsNow} dogs`, meta: parks[0].name },
  { label: "Next", value: "Sun", meta: "meadow meetup" },
];

const shortcuts: { href: Href; label: string; text: string }[] = [
  { href: "/shop", label: "Shop", text: "Everyday essentials" },
  { href: "/care", label: "Care", text: "Walks & grooming" },
  { href: "/social", label: "Around", text: "Friends, events, parks" },
  { href: "/bowl", label: "Nutrition", text: "Log a meal" },
];

const dotColor: Record<string, string> = {
  Walk: c.brand,
  Meal: c.accent,
  Play: c.warn,
  Care: c.info,
  Sleep: c.calm,
};

export default function HomeScreen() {
  const pet = useSession().pet ?? userPet;
  return (
    <Screen>
      <Chip tone="accent">For {pet.name} · {pet.breed}</Chip>
      <PageHead title="A quiet day, already underway." />

      <View style={styles.hero}>
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1200&q=80" }}
          style={styles.heroImage}
        />
      </View>

      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={ui.meta} numberOfLines={1}>{s.meta}</Text>
          </View>
        ))}
      </View>

      <SectionLabel>Jump to</SectionLabel>
      <View style={styles.shortcuts}>
        {shortcuts.map((s) => (
          <Link key={s.label} href={s.href} asChild>
            <Pressable style={styles.shortcut}>
              <Text style={ui.title}>{s.label}</Text>
              <Text style={ui.meta}>{s.text} →</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <SectionLabel>Today’s timeline</SectionLabel>
      {todayActivity.map((item) => (
        <View key={item.id} style={ui.listItem}>
          <Text style={styles.time}>{item.at}</Text>
          <View style={[styles.dot, { backgroundColor: dotColor[item.type] ?? c.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={ui.meta}>{item.type} · {item.detail}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: r.lg, overflow: "hidden", marginBottom: 14, backgroundColor: c.brandSoft },
  heroImage: { width: "100%", height: 260 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.sm + 4,
  },
  statLabel: { fontFamily: fonts.sansSemi, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: c.muted },
  statValue: { fontFamily: fonts.headingHeavy, fontSize: 21, letterSpacing: -0.4, color: c.ink, marginVertical: 2 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  shortcut: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 16,
    gap: 4,
    borderRadius: r.sm + 4,
    backgroundColor: c.brandSoft,
  },
  time: { width: 44, fontFamily: fonts.sansSemi, fontSize: 12.5, color: c.muted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: c.ink, marginBottom: 2 },
});
