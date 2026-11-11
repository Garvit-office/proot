import { ORDER_STATUS_LABELS, rupees, type Order } from "@proot/shared";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Card, Chip, Empty, ErrorState, Loading, Photo, r, Screen, SmallButton, ui } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";
import { orderTone } from "@/lib/status";

export default function OrdersScreen() {
  const orders = useResource<Order[]>(() => api.listOrders(), [], { focus: true });
  useRealtimeEvent("order:updated", (o) => {
    orders.setData((list) => (list?.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? o : x)) : list));
  });

  return (
    <Screen onRefresh={orders.reload}>
      {orders.loading ? <Loading /> : orders.error && !orders.data ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data?.length === 0 ? <Empty title="No orders yet." action={<SmallButton label="Go to the shop" onPress={() => router.navigate("/shop")} />} /> : null}
      {orders.data?.map((o) => (
        <Pressable key={o.id} onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })} accessibilityRole="button">
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={ui.headRow}>
              <Text style={ui.rowTitle}>Order · {formatDate(o.placedAt)}</Text>
              <Chip tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Chip>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {o.items.slice(0, 5).map((i) => <Photo key={i.id} uri={i.imageUrl} style={{ width: 44, height: 44, borderRadius: r.sm }} />)}
            </View>
            <Text style={ui.meta}>{o.items.reduce((n, i) => n + i.quantity, 0)} item(s) · {rupees(o.totalPaise)}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
