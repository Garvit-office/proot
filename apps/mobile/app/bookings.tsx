import { type Booking } from "@proot/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BookingCard } from "@/components/BookingCard";
import { Button, c, Card, Empty, ErrorState, Field, Loading, Notice, Screen, SectionLabel, SmallButton, ui } from "@/components/ui";
import { confirm } from "@/lib/confirm";
import { errorText, useResource } from "@/lib/hooks";
import { pay } from "@/lib/payments";
import { useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";

export default function BookingsScreen() {
  const params = useLocalSearchParams<{ notice?: string; highlight?: string }>();
  const bookings = useResource<Booking[]>(() => api.listBookings(), [], { focus: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad" | "warn" | "info"; text: string } | null>(params.notice ? { tone: "info", text: params.notice } : null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useRealtimeEvent("booking:updated", (b) => {
    bookings.setData((list) => (list?.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : list ? [b, ...list] : list));
  });
  useRealtimeEvent("payment:updated", (p) => {
    if (p.purpose === "BOOKING") bookings.reload();
  });

  async function run(id: string, action: () => Promise<unknown>, done?: string) {
    setBusy(id);
    setMessage(null);
    try {
      await action();
      await bookings.reload();
      if (done) setMessage({ tone: "good", text: done });
    } catch (err) {
      setMessage({ tone: "bad", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function payNow(b: Booking) {
    setBusy(b.id);
    setMessage(null);
    try {
      const outcome = await pay(() => api.payBooking(b.id));
      setMessage({ tone: outcome.kind === "paid" ? "good" : outcome.kind === "unavailable" ? "bad" : "warn", text: outcome.kind === "paid" ? "Paid. The provider will confirm shortly." : outcome.message });
      await bookings.reload();
    } catch (err) {
      setMessage({ tone: "bad", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(b: Booking) {
    const ok = await confirm("Cancel this booking?", b.isPaid ? "Paid bookings are refunded in full." : "You can book again any time.", "Cancel booking");
    if (ok) run(b.id, () => api.setBookingStatus(b.id, "CANCELLED"), "Booking cancelled.");
  }

  function submitReview(b: Booking) {
    run(b.id, () => api.reviewBooking(b.id, { rating, comment: comment.trim() || undefined }), "Thanks for the review!").then(() => {
      setReviewing(null);
      setComment("");
      setRating(5);
    });
  }

  const now = Date.now();
  const upcoming = bookings.data?.filter((b) => (b.status === "REQUESTED" || b.status === "CONFIRMED") && new Date(b.endsAt).getTime() > now) ?? [];
  const past = bookings.data?.filter((b) => !upcoming.includes(b)) ?? [];

  function card(b: Booking) {
    return (
      <View key={b.id}>
        <BookingCard booking={b} as="customer" highlight={params.highlight === b.id}>
          {b.status === "REQUESTED" && !b.isPaid ? <SmallButton label={busy === b.id ? "Opening…" : "Pay now"} tone="brand" disabled={busy === b.id} onPress={() => payNow(b)} /> : null}
          {b.status === "REQUESTED" || b.status === "CONFIRMED" ? <SmallButton label="Cancel" tone="bad" disabled={busy === b.id} onPress={() => cancel(b)} /> : null}
          {b.status === "COMPLETED" && !b.review ? <SmallButton label="Leave a review" tone="brand" onPress={() => setReviewing(reviewing === b.id ? null : b.id)} /> : null}
          <SmallButton label="Service" onPress={() => router.push({ pathname: "/service/[id]", params: { id: b.service.id } })} />
        </BookingCard>
        {reviewing === b.id ? (
          <Card style={{ padding: 14, marginTop: -8 }}>
            <Text style={ui.label}>Rating</Text>
            <View style={{ flexDirection: "row", gap: 6, marginVertical: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="radio" accessibilityState={{ selected: rating === n }} accessibilityLabel={`${n} stars`} hitSlop={4}>
                  <Text style={{ fontSize: 28, color: n <= rating ? c.accent : c.lineStrong }}>★</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={1000} />
            <View style={ui.row}><Button label={busy === b.id ? "Sending…" : "Post review"} disabled={busy === b.id} onPress={() => submitReview(b)} /></View>
          </Card>
        ) : null}
      </View>
    );
  }

  return (
    <Screen onRefresh={bookings.reload}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {bookings.loading ? <Loading /> : bookings.error && !bookings.data ? <ErrorState message={bookings.error} onRetry={bookings.reload} /> : null}
      {bookings.data?.length === 0 ? <Empty title="No bookings yet." action={<SmallButton label="Find care" onPress={() => router.navigate("/care")} />} /> : null}
      {upcoming.length ? <SectionLabel style={{ marginTop: 0 }}>Upcoming</SectionLabel> : null}
      {upcoming.map(card)}
      {past.length ? <SectionLabel>Past</SectionLabel> : null}
      {past.map(card)}
    </Screen>
  );
}
