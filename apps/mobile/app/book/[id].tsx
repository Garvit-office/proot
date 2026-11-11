import { formatDuration, rupees, type CareServiceDetail, type SlotsResponse } from "@proot/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addressLines } from "@/components/AddressForm";
import { PetAvatar } from "@/components/ProfileDrawer";
import { Button, c, ErrorState, Field, Loading, Notice, Pills, r, SectionLabel, ui } from "@/components/ui";
import { formatTime, upcomingDays } from "@/lib/format";
import { errorText, useResource } from "@/lib/hooks";
import { pay } from "@/lib/payments";
import { api, useSession } from "@/lib/session";

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, pet: activePet } = useSession();
  const service = useResource<CareServiceDetail>(() => api.getService(id), [id]);
  const days = useMemo(() => upcomingDays(14), []);
  const [date, setDate] = useState(days[0].key);
  const slots = useResource<SlotsResponse>(() => api.getSlots(id, date), [id, date]);
  const [slot, setSlot] = useState<string | null>(null);
  const [petId, setPetId] = useState(activePet?.id ?? pets[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Prefill the visit address from the default saved address.
  useEffect(() => {
    api.listAddresses().then((list) => {
      const a = list.find((x) => x.isDefault) ?? list[0];
      if (a) setAddress((cur) => cur || addressLines({ ...a, fullName: "", phone: "" }).replace(/\n/g, ", "));
    }).catch(() => {});
  }, []);

  useEffect(() => setSlot(null), [date]);

  async function book() {
    if (!slot) return setError("Pick a time.");
    if (!petId) return setError("Choose which dog this is for.");
    if (address.trim().length < 5) return setError("Add the address for the visit.");
    setBusy(true);
    setError("");
    try {
      const { booking, payment } = await api.createBooking({ serviceId: id, petId, startsAt: slot, address: address.trim(), notes: notes.trim() || undefined });
      const outcome = await pay(async () => payment);
      router.replace({ pathname: "/bookings", params: { notice: outcome.kind === "paid" ? "Booked and paid. The provider will confirm shortly." : outcome.message, highlight: booking.id } });
    } catch (err) {
      setError(errorText(err));
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  const s = service.data;
  if (service.loading) return <Loading />;
  if (!s) return <ErrorState message={service.error || "Service not found."} onRetry={service.reload} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Text style={ui.title}>{s.title}</Text>
        <Text style={ui.meta}>{s.provider.name} · {formatDuration(s.durationMin)} · {rupees(s.pricePaise)}</Text>

        <SectionLabel>1 · Day</SectionLabel>
        <Pills options={days.map((d) => d.key)} value={date} onChange={setDate} labels={Object.fromEntries(days.map((d) => [d.key, d.label]))} />

        <SectionLabel style={{ marginTop: 12 }}>2 · Time</SectionLabel>
        {slots.loading ? <Loading /> : slots.error ? <ErrorState message={slots.error} onRetry={slots.reload} /> : null}
        {slots.data && slots.data.slots.length === 0 ? <Text style={ui.body}>No free times that day. Try another day.</Text> : null}
        <View style={styles.slots}>
          {slots.data?.slots.map((t) => (
            <Pressable key={t} onPress={() => setSlot(t)} style={[ui.pill, slot === t && ui.pillOn]} accessibilityRole="radio" accessibilityState={{ selected: slot === t }}>
              <Text style={[ui.pillText, slot === t && { color: c.brand }]}>{formatTime(t)}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>3 · Dog</SectionLabel>
        <View style={styles.slots}>
          {pets.map((p) => (
            <Pressable key={p.id} onPress={() => setPetId(p.id)} style={[styles.pet, petId === p.id && ui.pillOn]} accessibilityRole="radio" accessibilityState={{ selected: petId === p.id }}>
              <PetAvatar pet={p} size={26} />
              <Text style={[ui.pillText, petId === p.id && { color: c.brand }]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>4 · Where & notes</SectionLabel>
        <Field label="Address" value={address} onChangeText={setAddress} multiline maxLength={300} placeholder="Flat, street, area" />
        <Field label="Notes for the provider (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="Gate code, quirks, what to bring…" />

        {error ? <Notice>{error}</Notice> : null}
        <View style={ui.row}>
          <Button label={busy ? "Booking…" : `Book & pay ${rupees(s.pricePaise)}`} onPress={book} disabled={busy || !slot} />
        </View>
        <Text style={[ui.meta, { marginTop: 10, textAlign: "center" }]}>The provider confirms after payment. Free cancellation before then.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  pet: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 14, paddingVertical: 4, borderRadius: r.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
});
