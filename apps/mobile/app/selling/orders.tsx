import { ORDER_STATUS_LABELS, rupees, type FulfilmentStatus, type Order } from "@proot/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { addressLines } from "@/components/AddressForm";
import { Card, Chip, Empty, ErrorState, Loading, Notice, Photo, r, Screen, SmallButton, ui } from "@/components/ui";
import { formatWhen } from "@/lib/format";
import { errorText, useResource } from "@/lib/hooks";
import { useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";
import { fulfilmentLabel, fulfilmentTone, orderTone } from "@/lib/status";

export default function SellingOrdersScreen() {
  const orders = useResource<Order[]>(() => api.listSellingOrders(), [], { focus: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // order:updated carries the buyer's full view; refetch to keep only our own line items.
  useRealtimeEvent("order:updated", () => orders.reload());

  async function mark(order: Order, itemId: string, fulfilment: FulfilmentStatus) {
    setBusy(itemId);
    setError("");
    try {
      await api.updateOrderItem(order.id, itemId, fulfilment);
      await orders.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onRefresh={orders.reload}>
      {error ? <Notice>{error}</Notice> : null}
      {orders.loading ? <Loading /> : orders.error && !orders.data ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data?.length === 0 ? <Empty title="No sales yet." text="When someone buys one of your listings it shows up here." /> : null}
      {orders.data?.map((o) => {
        const live = o.status === "PAID" || o.status === "SHIPPED";
        return (
          <Card key={o.id} style={{ padding: 14, gap: 10 }}>
            <View style={ui.headRow}>
              <Text style={ui.rowTitle}>{o.buyer.name}</Text>
              <Chip tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Chip>
            </View>
            <Text style={ui.meta}>{formatWhen(o.placedAt)}</Text>
            {o.items.map((i) => (
              <View key={i.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <Photo uri={i.imageUrl} style={{ width: 44, height: 44, borderRadius: r.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle} numberOfLines={2}>{i.title}</Text>
                    <Text style={ui.meta}>{i.quantity} × {rupees(i.unitPaise)}</Text>
                  </View>
                  <Chip tone={fulfilmentTone[i.fulfilment]}>{fulfilmentLabel[i.fulfilment]}</Chip>
                </View>
                {live && i.fulfilment === "PENDING" ? (
                  <SmallButton label={busy === i.id ? "Saving…" : "Mark shipped"} tone="brand" disabled={busy === i.id} onPress={() => mark(o, i.id, "SHIPPED")} style={{ alignSelf: "flex-start" }} />
                ) : null}
                {live && i.fulfilment === "SHIPPED" ? (
                  <SmallButton label={busy === i.id ? "Saving…" : "Mark delivered"} tone="brand" disabled={busy === i.id} onPress={() => mark(o, i.id, "DELIVERED")} style={{ alignSelf: "flex-start" }} />
                ) : null}
              </View>
            ))}
            {live ? <Text style={ui.body}>{addressLines(o.shippingAddress)}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
