import { BOOKING_STATUS_LABELS, formatDistance, type HomeResponse } from "@proot/shared";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PetAvatar } from "@/components/ProfileDrawer";
import { c, Card, Chip, Empty, ErrorState, fonts, Loading, NavRow, PageHead, r, Screen, SectionLabel, ui } from "@/components/ui";
import { formatWhen } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { api, useSession } from "@/lib/session";

const shortcuts: { href: Href; label: string; text: string }[] = [
  { href: "/activity", label: "Activity", text: "Log a walk or nap" },
  { href: "/bowl", label: "Bowl", text: "Check a meal" },
  { href: "/shop", label: "Shop", text: "Local listings" },
  { href: "/care", label: "Care", text: "Walks & grooming" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const { pet, user } = useSession();
  const { unreadNotifications } = useRealtime();
  const home = useResource<HomeResponse>(() => api.home(pet?.id), [pet?.id], { focus: true });
  const data = home.data;

  useRealtimeEvent("park:presence", (p) => {
    home.setData((d) => (d?.nearestPark?.id === p.parkId ? { ...d, nearestPark: { ...d.nearestPark, dogsNow: p.dogsNow } } : d));
  });
  useRealtimeEvent("event:updated", (p) => {
    if (data?.nextEvent?.id !== p.id) return;
    if (p.deleted) home.reload();
    else home.setData((d) => (d?.nextEvent ? { ...d, nextEvent: { ...d.nextEvent, rsvpCount: p.rsvpCount } } : d));
  });
  useRealtimeEvent("booking:updated", () => home.reload());

  const today = data?.today;
  const target = today?.targetKcal ?? null;
  const pct = target && today ? Math.min(1, today.kcalIn / target) : 0;

  return (
    <Screen onRefresh={home.reload}>
      {pet ? (
        <View style={styles.petRow}>
          <PetAvatar pet={pet} size={44} />
          <Chip tone="accent">For {pet.name} · {pet.breed}</Chip>
        </View>
      ) : null}
      <PageHead title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}.`} lede={pet ? `Here’s ${pet.name}’s day so far.` : undefined} />

      {unreadNotifications ? (
        <NavRow title="Notifications" meta={`${unreadNotifications} unread`} badge={unreadNotifications} onPress={() => router.push("/notifications")} />
      ) : null}

      {home.loading ? <Loading /> : home.error && !data ? <ErrorState message={home.error} onRetry={home.reload} /> : null}

      {today ? (
        <>
          <Card style={{ padding: 16, gap: 10 }}>
            <View style={ui.headRow}>
              <Text style={ui.eyebrow}>Today’s food</Text>
              <Text style={ui.link} onPress={() => router.push("/bowl")}>Log a meal →</Text>
            </View>
            <Text style={styles.big}>
              {today.kcalIn}
              <Text style={ui.meta}> {target ? `of ${target} kcal` : "kcal"}</Text>
            </Text>
            {target ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: today.kcalIn > target ? c.bad : c.good }]} />
              </View>
            ) : null}
          </Card>

          <Pressable onPress={() => router.push("/activity")} style={styles.stats} accessibilityRole="button" accessibilityLabel="Open activity">
            <Stat label="Walk" value={`${today.walkKm.toFixed(1)} km`} meta={`${today.walkMin} min`} />
            <Stat label="Play" value={`${today.playMin} min`} meta="today" />
            <Stat label="Sleep" value={`${today.sleepHours.toFixed(1)} h`} meta="logged" />
            <Stat label="Nearby" value={`${data?.dogsNearbyNow ?? 0} dogs`} meta="at parks now" />
          </Pressable>
        </>
      ) : null}

      {data ? (
        <>
          <SectionLabel>Coming up</SectionLabel>
          {data.nextBooking ? (
            <Pressable onPress={() => router.push("/bookings")} accessibilityRole="button">
              <Card style={{ padding: 16, gap: 4 }}>
                <View style={ui.headRow}>
                  <Text style={ui.eyebrow}>Next booking</Text>
                  <Chip tone={data.nextBooking.status === "CONFIRMED" ? "good" : "warn"}>{BOOKING_STATUS_LABELS[data.nextBooking.status]}</Chip>
                </View>
                <Text style={ui.title}>{data.nextBooking.service.title}</Text>
                <Text style={ui.meta}>{formatWhen(data.nextBooking.startsAt)} · {data.nextBooking.provider.name}</Text>
              </Card>
            </Pressable>
          ) : null}
          {data.nextEvent ? (
            <Pressable onPress={() => router.push({ pathname: "/events/[id]", params: { id: data.nextEvent!.id } })} accessibilityRole="button">
              <Card style={{ padding: 16, gap: 4 }}>
                <View style={ui.headRow}>
                  <Text style={ui.eyebrow}>Next event</Text>
                  <Chip tone={data.nextEvent.rsvped ? "good" : "brand"}>{data.nextEvent.rsvped ? "Going" : `${data.nextEvent.rsvpCount} going`}</Chip>
                </View>
                <Text style={ui.title}>{data.nextEvent.title}</Text>
                <Text style={ui.meta}>{formatWhen(data.nextEvent.startsAt)} · {data.nextEvent.location}</Text>
              </Card>
            </Pressable>
          ) : null}
          {data.nearestPark ? (
            <Pressable onPress={() => router.push({ pathname: "/parks/[id]", params: { id: data.nearestPark!.id } })} accessibilityRole="button">
              <Card style={{ padding: 16, gap: 4 }}>
                <View style={ui.headRow}>
                  <Text style={ui.eyebrow}>Nearest park</Text>
                  <Chip tone={data.nearestPark.dogsNow ? "good" : "neutral"}>● {data.nearestPark.dogsNow} now</Chip>
                </View>
                <Text style={ui.title}>{data.nearestPark.name}</Text>
                <Text style={ui.meta}>{[formatDistance(data.nearestPark.distanceKm), data.nearestPark.hours].filter(Boolean).join(" · ")}</Text>
                {data.nearestPark.checkedIn ? <Chip tone="good" style={{ marginTop: 4 }}>You’re checked in</Chip> : null}
              </Card>
            </Pressable>
          ) : null}
          {!data.nextBooking && !data.nextEvent && !data.nearestPark ? (
            <Empty title="Nothing on the calendar." text="Book a walk or RSVP to an event and it will show up here." />
          ) : null}
        </>
      ) : null}

      <SectionLabel>Jump to</SectionLabel>
      <View style={styles.shortcuts}>
        {shortcuts.map((s) => (
          <Pressable key={s.label} style={styles.shortcut} onPress={() => router.push(s.href)} accessibilityRole="button">
            <Text style={ui.title}>{s.label}</Text>
            <Text style={ui.meta}>{s.text} →</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={ui.meta} numberOfLines={1}>{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  petRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  big: { fontFamily: fonts.headingHeavy, fontSize: 34, letterSpacing: -1, color: c.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
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
});
