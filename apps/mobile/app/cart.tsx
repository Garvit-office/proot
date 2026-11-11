import { FREE_SHIPPING_PAISE, rupees, type Cart } from "@proot/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, c, Card, Chip, Empty, ErrorState, fonts, Line, Loading, Notice, Photo, r, Screen, SmallButton, ui } from "@/components/ui";
import { confirm } from "@/lib/confirm";
import { errorText, useResource } from "@/lib/hooks";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";

export default function CartScreen() {
  const { setCartCount } = useRealtime();
  const cart = useResource<Cart>(() => api.getCart(), [], { focus: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useRealtimeEvent("cart:updated", () => cart.reload());
  useRealtimeEvent("product:updated", (p) => {
    if (cart.data?.items.some((i) => i.product.id === p.id)) cart.reload();
  });

  async function change(key: string, action: () => Promise<Cart>) {
    setBusy(key);
    setError("");
    try {
      const next = await action();
      cart.setData(next);
      setCartCount(next.count);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (await confirm("Empty your cart?", "This removes every item.", "Empty cart")) change("clear", () => api.clearCart());
  }

  const data = cart.data;
  if (cart.loading) return <Loading />;
  if (!data) return <ErrorState message={cart.error} onRetry={cart.reload} />;

  const blocked = data.items.some((i) => !i.available);
  const toFree = FREE_SHIPPING_PAISE - data.subtotalPaise;

  return (
    <Screen onRefresh={cart.reload}>
      {error ? <Notice>{error}</Notice> : null}
      {data.items.length === 0 ? (
        <Empty title="Your cart is empty." text="Find something good in the shop." action={<SmallButton label="Browse the shop" onPress={() => router.navigate("/shop")} />} />
      ) : (
        <>
          {data.items.map((item) => (
            <Card key={item.product.id} style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.product.id } })}>
                  <Photo uri={item.product.images[0]} style={styles.thumb} />
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={ui.rowTitle} numberOfLines={2}>{item.product.title}</Text>
                  <Text style={ui.meta}>{rupees(item.product.pricePaise)} · {item.product.seller.name}</Text>
                  {!item.available ? <Chip tone="bad">{item.product.status !== "ACTIVE" ? "No longer available" : `Only ${item.product.stock} left`}</Chip> : null}
                  <View style={styles.qty}>
                    <SmallButton label="−" disabled={!!busy} onPress={() => change(item.product.id, () => api.setCartItem(item.product.id, item.quantity - 1))} />
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <SmallButton label="+" disabled={!!busy || item.quantity >= item.product.stock} onPress={() => change(item.product.id, () => api.setCartItem(item.product.id, item.quantity + 1))} />
                    <View style={{ flex: 1 }} />
                    <SmallButton label="Remove" tone="bad" disabled={!!busy} onPress={() => change(item.product.id, () => api.removeCartItem(item.product.id))} />
                  </View>
                </View>
                <Text style={ui.price}>{rupees(item.lineTotalPaise)}</Text>
              </View>
            </Card>
          ))}

          <Card style={{ padding: 16, gap: 8 }}>
            <Line label="Subtotal" value={rupees(data.subtotalPaise)} />
            <Line label="Shipping" value={data.shippingPaise ? rupees(data.shippingPaise) : "Free"} />
            <View style={styles.rule} />
            <Line label="Total" value={rupees(data.totalPaise)} strong />
            {toFree > 0 ? <Text style={ui.meta}>Add {rupees(toFree)} more for free shipping.</Text> : null}
          </Card>
          {blocked ? <Notice tone="warn">Some items are unavailable. Remove them or lower the quantity to check out.</Notice> : null}
          <View style={ui.row}>
            <Button variant="secondary" label="Empty cart" onPress={clear} disabled={!!busy} />
            <Button label="Checkout" onPress={() => router.push("/checkout")} disabled={blocked || !!busy} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 64, height: 64, borderRadius: r.sm },
  qty: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  qtyValue: { minWidth: 18, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  rule: { height: 1, backgroundColor: c.line },
});
