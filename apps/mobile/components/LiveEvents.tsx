import { canManageEvents, type EventRecord } from "@proot/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, c, Card, Chip, fonts, r, SectionLabel, ui } from "@/components/ui";
import { api, useSession } from "@/lib/session";

function when(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Published events from the API with RSVP; organisers get a shortcut to manage them. */
export function LiveEvents() {
  const { user } = useSession();
  const [events, setEvents] = useState<EventRecord[]>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.listEvents().then((res) => setEvents(res.visible)).catch((err) => setError(err.message));
  }, []);
  // Refresh whenever the tab comes back into view (e.g. after publishing from Manage events).
  useFocusEffect(load);

  async function toggle(e: EventRecord) {
    setBusy(e.id);
    setError("");
    try {
      const updated = e.rsvped ? await api.cancelRsvp(e.id) : await api.rsvp(e.id);
      setEvents((list) => list?.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <View style={styles.head}>
        <SectionLabel style={{ marginBottom: 0 }}>Live events</SectionLabel>
        {canManageEvents(user?.role) ? (
          <Text style={styles.link} onPress={() => router.push("/manage-events")} accessibilityRole="link">Manage →</Text>
        ) : null}
      </View>
      {error ? <Text style={[ui.meta, { color: c.bad, marginBottom: 8 }]}>{error}</Text> : null}
      {events?.length === 0 ? <Text style={[ui.body, { marginBottom: 8 }]}>Nothing published yet — check back soon.</Text> : null}
      {events?.map((e) => {
        const full = e.capacity > 0 && e.rsvpCount >= e.capacity && !e.rsvped;
        const left = e.capacity ? Math.max(0, e.capacity - e.rsvpCount) : null;
        return (
          <Card key={e.id} style={{ padding: 16, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={[ui.title, { flex: 1 }]}>{e.title}</Text>
              <Chip tone={full ? "bad" : left !== null && left <= 3 ? "warn" : "brand"}>
                {left === null ? `${e.rsvpCount} going` : full ? "Full" : `${left} left`}
              </Chip>
            </View>
            <Text style={ui.meta}>{when(e.startsAt)} · {e.location}</Text>
            <Text style={ui.body} numberOfLines={3}>{e.description}</Text>
            <View style={[ui.row, { marginTop: 6 }]}>
              <Button
                variant={e.rsvped ? "secondary" : "primary"}
                label={e.rsvped ? "Going ✓ · Cancel" : full ? "Full" : "RSVP"}
                disabled={busy === e.id || full}
                onPress={() => toggle(e)}
              />
            </View>
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 },
  link: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.brand, paddingVertical: 4, paddingHorizontal: 2, borderRadius: r.sm },
});
