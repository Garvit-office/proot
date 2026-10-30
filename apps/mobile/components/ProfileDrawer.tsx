import { canManageEvents, estimateDailyKcal, isAdmin, ROLE_LABELS, sizeFromWeight, type PetRecord } from "@proot/shared";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, c, Chip, fonts, r, ui } from "@/components/ui";
import { useSession } from "@/lib/session";

export function PetAvatar({ pet, size = 34 }: { pet: Pick<PetRecord, "name" | "photo">; size?: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return pet.photo ? (
    <Image source={{ uri: pet.photo }} style={[shape, { backgroundColor: c.surface2 }]} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[shape, styles.initial]}>
      <Text style={[styles.initialText, { fontSize: size * 0.4 }]}>{pet.name[0]?.toUpperCase()}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Rows({ rows }: { rows: [string, string | undefined | null][] }) {
  const visible = rows.filter(([, v]) => v);
  return (
    <View style={styles.rows}>
      {visible.map(([label, value], i) => (
        <View key={label} style={[styles.row, i === visible.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={ui.meta}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Right-side slide-over with the active dog's profile and account actions. */
export function ProfileDrawer() {
  const { profileOpen: open, setProfileOpen, user, pets, pet, selectPet, signOut } = useSession();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(width * 0.88, 400);
  const [progress] = useState(() => new Animated.Value(0));
  // Stay mounted through the close animation; mount immediately on open.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 280 : 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, progress]);

  const close = () => setProfileOpen(false);
  const go = (href: Parameters<typeof router.push>[0]) => {
    close();
    router.push(href);
  };

  if (!mounted) return null;

  const kcal = pet ? estimateDailyKcal(pet.weightKg, pet.activityLevel, pet.neutered, pet.birthDate) : 0;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close profile" />
      </Animated.View>

      <Animated.View
        style={[styles.panel, { width: panelWidth, paddingTop: insets.top, transform: [{ translateX }] }]}
        accessibilityViewIsModal
      >
        <View style={styles.head}>
          <Text style={ui.eyebrow}>Profile</Text>
          <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close profile" hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
          {pet ? (
            <>
              <View style={styles.hero}>
                <PetAvatar pet={pet} size={76} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{pet.name}</Text>
                  <Text style={ui.meta}>{pet.breed} · {pet.sex} · {pet.age}{pet.birthDateApprox ? " (approx.)" : ""}</Text>
                </View>
              </View>

              {pets.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {pets.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => selectPet(p.id)}
                      style={[styles.switch, p.id === pet.id && styles.switchActive]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: p.id === pet.id }}
                    >
                      <PetAvatar pet={p} size={22} />
                      <Text style={[styles.switchText, p.id === pet.id && { color: c.brand }]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.stats}>
                <Stat value={`${pet.weightKg} kg`} label={sizeFromWeight(pet.weightKg)} />
                <Stat value={`~${kcal}`} label="kcal / day" />
                <Stat value={`${pet.mealsPerDay}×`} label="meals" />
              </View>

              {pet.bio ? <Text style={ui.body}>{pet.bio}</Text> : null}
              {pet.answer ? (
                <View style={styles.prompt}>
                  <Text style={styles.promptQ}>{pet.prompt}</Text>
                  <Text style={ui.body}>“{pet.answer}”</Text>
                </View>
              ) : null}

              <Section title="Personality">
                <View style={styles.chips}>
                  <Chip tone="brand">{pet.social}</Chip>
                  {pet.temperament.map((t) => <Chip key={t}>{t}</Chip>)}
                </View>
              </Section>

              <Section title="Routine">
                <Rows rows={[["Diet", pet.dietType], ["Meals", `${pet.mealsPerDay} a day`], ["Activity", pet.activityLevel]]} />
              </Section>

              <Section title="Health">
                <Rows
                  rows={[
                    ["Neutered", pet.neutered ? "Yes" : "No"],
                    ["Vaccines", pet.vaccinations.join(", ") || "None recorded"],
                    ["Allergies", pet.allergies],
                    ["Conditions", pet.conditions],
                    ["Vet", [pet.vetName, pet.vetPhone].filter(Boolean).join(" · ")],
                    ["Microchip", pet.microchipId],
                  ]}
                />
              </Section>

              <View style={{ gap: 8 }}>
                <View style={ui.row}><Button label={`Edit ${pet.name}’s profile`} onPress={() => go({ pathname: "/onboarding", params: { edit: pet.id } })} /></View>
                <View style={ui.row}><Button variant="secondary" label="Add another dog" onPress={() => go({ pathname: "/onboarding", params: { new: "1" } })} /></View>
              </View>
            </>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={styles.name}>No dog yet</Text>
              <Text style={ui.body}>Tell us about your dog to personalise Proot.</Text>
              <View style={ui.row}><Button label="Set up a profile" onPress={() => go("/onboarding")} /></View>
            </View>
          )}

          {user && (
            <View style={styles.account}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.rowValue, { textAlign: "left" }]}>{user.name}</Text>
                <Chip tone={isAdmin(user.role) ? "brand" : canManageEvents(user.role) ? "warn" : "neutral"}>{ROLE_LABELS[user.role]}</Chip>
              </View>
              <Text style={ui.meta}>{user.email}</Text>
              {canManageEvents(user.role) && pet ? (
                <View style={[ui.row, { marginTop: 12 }]}>
                  <Button label={isAdmin(user.role) ? "Manage all events" : "Manage your events"} onPress={() => go("/manage-events")} />
                </View>
              ) : null}
              <View style={[ui.row, { marginTop: 12 }]}><Button variant="secondary" label="Sign out" onPress={signOut} /></View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={ui.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { alignItems: "center", justifyContent: "center", backgroundColor: c.accentSoft },
  initialText: { fontFamily: fonts.sansBold, color: c.accentInk },
  scrim: { backgroundColor: "rgba(22,50,59,0.38)" },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.bg,
    borderLeftWidth: 1,
    borderLeftColor: c.line,
    shadowColor: "#16323B",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 16,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    backgroundColor: c.surface,
  },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.lineStrong },
  closeText: { fontSize: 14, color: c.ink },
  body: { padding: 20, gap: 18 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.5, color: c.ink },
  switch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: r.pill,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
  },
  switchActive: { borderColor: c.brand, backgroundColor: c.brandSoft },
  switchText: { fontFamily: fonts.sansSemi, fontSize: 13, color: c.inkSoft },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: r.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  statValue: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  prompt: { padding: 14, borderLeftWidth: 3, borderLeftColor: c.accent, borderRadius: r.sm, backgroundColor: c.accentSoft, gap: 4 },
  promptQ: { fontFamily: fonts.sansSemi, fontSize: 14, color: c.ink },
  sectionTitle: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rows: { paddingHorizontal: 14, borderRadius: r.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  rowValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  account: { gap: 2, paddingTop: 18, borderTopWidth: 1, borderTopColor: c.line },
});
