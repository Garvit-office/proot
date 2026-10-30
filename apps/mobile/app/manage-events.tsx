import { isAdmin, type EventInput, type EventRecord } from "@proot/shared";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { Button, c, Card, Chip, fonts, PageHead, r, SectionLabel, ui } from "@/components/ui";
import { api, useSession } from "@/lib/session";

type Form = Omit<EventInput, "startsAt" | "capacity"> & { date: string; time: string; capacity: string };

const blank: Form = { title: "", description: "", location: "", date: "", time: "18:00", capacity: "0", published: false };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formFromEvent(e: EventRecord): Form {
  const d = new Date(e.startsAt);
  return {
    title: e.title,
    description: e.description,
    location: e.location,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    capacity: String(e.capacity),
    published: e.published,
  };
}

function when(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Event managers and admins: create, edit, publish, and delete events. */
export default function ManageEventsScreen() {
  const { user } = useSession();
  const [events, setEvents] = useState<EventRecord[]>();
  // Captured at load so "Past" doesn't shift between renders.
  const [loadedAt, setLoadedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<EventRecord | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents((await api.listEvents()).manageable);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load events.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(target: EventRecord | "new") {
    setEditing(target);
    setForm(target === "new" ? blank : formFromEvent(target));
    setError("");
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) return setError("Fill in the title, description, and location.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^\d{2}:\d{2}$/.test(form.time)) return setError("Date is YYYY-MM-DD and time is HH:MM.");
    const startsAt = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(startsAt.getTime())) return setError("That date doesn’t exist.");
    if (editing === "new" && startsAt.getTime() < Date.now()) return setError("Pick a time in the future.");

    const body: EventInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      startsAt: startsAt.toISOString(),
      capacity: Math.max(0, Number(form.capacity) || 0),
      published: form.published,
    };
    setBusy("form");
    setError("");
    try {
      if (editing === "new") await api.createEvent(body);
      else if (editing) await api.updateEvent(editing.id, body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save.");
    } finally {
      setBusy(null);
    }
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete(e: EventRecord) {
    const message = `${e.rsvpCount ? `Its ${e.rsvpCount} RSVPs will be removed too. ` : ""}This can’t be undone.`;
    // Alert.alert has no buttons on web.
    if (Platform.OS === "web") {
      if (window.confirm(`Delete “${e.title}”? ${message}`)) run(e.id, () => api.deleteEvent(e.id));
      return;
    }
    Alert.alert(`Delete “${e.title}”?`, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => run(e.id, () => api.deleteEvent(e.id)) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Manage events" }} />
      <ScrollView
        style={ui.page}
        contentContainerStyle={ui.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <PageHead
          eyebrow={isAdmin(user?.role) ? "Admin · all events" : "Event manager"}
          title={editing ? (editing === "new" ? "New event" : "Edit event") : "Your events"}
          lede={editing ? undefined : "Drafts stay private. Publish to open RSVPs for the neighborhood."}
        />

        {error ? <Text style={styles.alert} accessibilityRole="alert">{error}</Text> : null}

        {editing ? (
          <Card style={{ padding: 16, gap: 14 }}>
            <Field label="Title" value={form.title} onChangeText={(v) => set("title", v)} maxLength={100} placeholder="Sunday meadow meetup" />
            <Field label="Description" value={form.description} onChangeText={(v) => set("description", v)} maxLength={1000} multiline placeholder="Off-leash hour for dogs who already play well." />
            <Field label="Location" value={form.location} onChangeText={(v) => set("location", v)} maxLength={120} placeholder="Riverside Lawn, Indiranagar" />
            <View style={ui.row}>
              <View style={{ flex: 1.4 }}><Field label="Date" value={form.date} onChangeText={(v) => set("date", v)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} /></View>
              <View style={{ flex: 1 }}><Field label="Time" value={form.time} onChangeText={(v) => set("time", v)} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5} /></View>
            </View>
            <Field label="Capacity (0 = no cap)" value={form.capacity} onChangeText={(v) => set("capacity", v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={5} />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Published</Text>
                <Text style={ui.meta}>Visible to everyone and open for RSVPs</Text>
              </View>
              <Switch value={form.published} onValueChange={(v) => set("published", v)} trackColor={{ true: c.brand, false: c.lineStrong }} />
            </View>
            <View style={ui.row}>
              <Button variant="secondary" label="Cancel" onPress={() => setEditing(null)} />
              <Button label={busy === "form" ? "Saving…" : editing === "new" ? (form.published ? "Publish" : "Save draft") : "Save"} onPress={save} disabled={busy === "form"} />
            </View>
          </Card>
        ) : (
          <>
            <View style={ui.row}><Button label="+ New event" onPress={() => open("new")} /></View>
            <SectionLabel>{events ? `${events.length} event${events.length === 1 ? "" : "s"}` : "Loading…"}</SectionLabel>
            {events?.length === 0 ? <Text style={ui.body}>No events yet. Create the first one.</Text> : null}
            {events?.map((e) => {
              const past = new Date(e.startsAt).getTime() < loadedAt;
              return (
                <Card key={e.id} style={{ padding: 16, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={[ui.title, { flex: 1 }]}>{e.title}</Text>
                    <Chip tone={past ? "neutral" : e.published ? "good" : "warn"}>{past ? "Past" : e.published ? "Published" : "Draft"}</Chip>
                  </View>
                  <Text style={ui.meta}>{when(e.startsAt)} · {e.location}</Text>
                  <Text style={ui.meta}>
                    {e.rsvpCount}{e.capacity ? ` / ${e.capacity}` : ""} going{isAdmin(user?.role) && e.managerName ? ` · by ${e.managerName}` : ""}
                  </Text>
                  <View style={[ui.row, { marginTop: 4 }]}>
                    <Button
                      variant="secondary"
                      label={e.published ? "Unpublish" : "Publish"}
                      disabled={busy === e.id}
                      onPress={() => run(e.id, () => api.updateEvent(e.id, { published: !e.published }))}
                    />
                    <Button variant="secondary" label="Edit" onPress={() => open(e)} />
                    <Button variant="secondary" label="Delete" disabled={busy === e.id} onPress={() => confirmDelete(e)} />
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  alert: { padding: 12, marginBottom: 14, borderRadius: r.sm, backgroundColor: c.badSoft, color: c.bad, fontFamily: fonts.sansMedium, fontSize: 13.5 },
});
