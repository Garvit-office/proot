import { ORDER_STATUS_LABELS, rupees, type Order } from "@proot/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addressLines } from "@/components/AddressForm";
import { Button, c, Card, Chip, ErrorState, Line, Loading, Notice, Photo, r, Screen, SectionLabel, ui } from "@/components/ui";
import { confirm } from "@/lib/confirm";
import { formatWhen } from "@/lib/format";
import { errorText, useResource } from "@/lib/hooks";
import { pay } from "@/lib/payments";
import { useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";
import { fulfilmentLabel, fulfilmentTone, orderTone } from "@/lib/status";

export default function OrderScreen() {
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const order = useResource<Order>(() => api.getOrder(id), [id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad" | "warn" | "info"; text: string } | null>(notice ? { tone: "info", text: notice } : null);

  useRealtimeEvent("order:updated", (o) => {
    if (o.id === id) order.setData(o);
  });
  useRealtimeEvent("payment:updated", (p) => {
    if (p.purpose === "ORDER" && p.referenceId === id) order.reload();
  });

  async function payNow() {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await pay(() => api.payOrder(id));
      setMessage({ tone: outcome.kind === "paid" ? "good" : outcome.kind === "unavailable" ? "bad" : "warn", text: outcome.kind === "paid" ? "Payment received. Thank you!" : outcome.message });
      await order.reload();
    } catch (err) {
      setMessage({ tone: "bad", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!(await confirm("Cancel this order?", order.data?.status === "PAID" ? "You’ll be refunded in full." : "Items go back on sale.", "Cancel order"))) return;
    setBusy(true);
    setMessage(null);
    try {
      order.setData(await api.cancelOrder(id));
    } catch (err) {
      setMessage({ tone: "bad", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const o = order.data;
  if (order.loading) return <Loading />;
  if (!o) return <ErrorState message={order.error || "Order not found."} onRetry={order.reload} />;
  const canCancel = o.status === "PENDING_PAYMENT" || (o.status === "PAID" && o.items.every((i) => i.fulfilment === "PENDING"));

  return (
    <Screen onRefresh={order.reload}>
      <View style={ui.headRow}>
        <Text style={ui.title}>Placed {formatWhen(o.placedAt)}</Text>
        <Chip tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Chip>
      </View>
      <Text style={[ui.meta, { marginBottom: 16 }]}>Order {o.id.slice(0, 8)}{o.paidAt ? ` · paid ${formatWhen(o.paidAt)}` : ""}</Text>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {o.items.map((i) => (
        <Pressable key={i.id} disabled={!i.productId} onPress={() => i.productId && router.push({ pathname: "/product/[id]", params: { id: i.productId } })}>
          <View style={ui.listItem}>
            <Photo uri={i.imageUrl} style={{ width: 52, height: 52, borderRadius: r.sm }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.rowTitle} numberOfLines={2}>{i.title}</Text>
              <Text style={ui.meta}>{i.quantity} × {rupees(i.unitPaise)} · {i.seller.name}</Text>
            </View>
            {o.status !== "PENDING_PAYMENT" && o.status !== "CANCELLED" ? <Chip tone={fulfilmentTone[i.fulfilment]}>{fulfilmentLabel[i.fulfilment]}</Chip> : null}
          </View>
        </Pressable>
      ))}

      <Card style={{ padding: 16, gap: 8, marginTop: 8 }}>
        <Line label="Subtotal" value={rupees(o.subtotalPaise)} />
        <Line label="Shipping" value={o.shippingPaise ? rupees(o.shippingPaise) : "Free"} />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <Line label="Total" value={rupees(o.totalPaise)} strong />
      </Card>

      <SectionLabel>Shipping to</SectionLabel>
      <Text style={ui.body}>{addressLines(o.shippingAddress)}</Text>

      <View style={[ui.row, { marginTop: 20 }]}>
        {canCancel ? <Button variant="secondary" label="Cancel order" onPress={cancel} disabled={busy} /> : null}
        {o.status === "PENDING_PAYMENT" ? <Button label={busy ? "Opening…" : `Pay ${rupees(o.totalPaise)}`} onPress={payNow} disabled={busy} /> : null}
      </View>
    </Screen>
  );
}
