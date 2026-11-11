import { BOOKING_STATUS_LABELS, rupees, type Booking } from "@proot/shared";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Card, Chip, Photo, r, ui } from "@/components/ui";
import { formatWhen } from "@/lib/format";
import { bookingTone } from "@/lib/status";

export function BookingCard({ booking: b, as, children, highlight }: { booking: Booking; as: "customer" | "provider"; children?: ReactNode; highlight?: boolean }) {
  const other = as === "customer" ? b.provider : b.customer;
  return (
    <Card style={[{ padding: 14, gap: 8 }, highlight && { borderColor: "#F2804B" }]}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Photo uri={b.service.imageUrl} style={{ width: 56, height: 56, borderRadius: r.sm }} label={b.service.category} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={ui.headRow}>
            <Text style={[ui.rowTitle, { flex: 1 }]} numberOfLines={2}>{b.service.title}</Text>
            <Chip tone={bookingTone[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</Chip>
          </View>
          <Text style={ui.meta}>{formatWhen(b.startsAt)}</Text>
          <Text style={ui.meta}>
            {as === "customer" ? "With" : "For"} {other.name}{b.pet ? ` · ${b.pet.name}` : ""} · {rupees(b.pricePaise)} · {b.isPaid ? "paid" : "unpaid"}
          </Text>
        </View>
      </View>
      {as === "provider" ? (
        <Text style={ui.body}>{b.address}{b.customer.phone ? `\n${b.customer.phone}` : ""}{b.notes ? `\n“${b.notes}”` : ""}</Text>
      ) : b.notes ? (
        <Text style={ui.meta}>Notes: {b.notes}</Text>
      ) : null}
      {b.review ? <Text style={ui.meta}>Your review: {"★".repeat(b.review.rating)} {b.review.comment}</Text> : null}
      {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View> : null}
    </Card>
  );
}
