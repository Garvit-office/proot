import { formatDistance, rupees, timeAgo, type Product } from "@proot/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Button, c, Card, Chip, ErrorState, fonts, Loading, Notice, Photo, Screen, SmallButton, ui } from "@/components/ui";
import { errorText, useResource } from "@/lib/hooks";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { api, useNear, useSession } from "@/lib/session";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const near = useNear();
  const { setCartCount } = useRealtime();
  const { width } = useWindowDimensions();
  const product = useResource<Product>(() => api.getProduct(id), [id]);
  const cart = useResource(() => api.getCart(), [], { focus: true });
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useRealtimeEvent("product:updated", (p) => {
    if (p.id !== id) return;
    if (p.deleted) product.reload();
    else product.setData((d) => (d ? { ...d, stock: p.stock, status: p.status as Product["status"] } : d));
  });

  const p = product.data;
  const inCart = cart.data?.items.find((i) => i.product.id === id)?.quantity ?? 0;
  const mine = p && user && p.seller.id === user.id;
  const buyable = p && p.status === "ACTIVE" && p.stock > 0 && !mine;
  const max = p ? Math.max(1, p.stock) : 1;
  // Distance from the product response is only filled when the query had coordinates.
  const distance = p?.distanceKm ?? (near && p?.lat != null && p?.lng != null ? haversine(near, { lat: p.lat, lng: p.lng }) : null);

  async function addToCart() {
    if (!p) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.setCartItem(p.id, Math.min(p.stock, inCart + qty));
      cart.setData(next);
      setCartCount(next.count);
      setMessage({ tone: "good", text: "Added to your cart." });
    } catch (err) {
      setMessage({ tone: "bad", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  if (product.loading) return <Loading />;
  if (!p) return <ErrorState message={product.error || "Listing not found."} onRetry={product.reload} />;

  return (
    <Screen onRefresh={() => Promise.all([product.reload(), cart.reload()])} contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}>
      <Stack.Screen options={{ title: p.title }} />
      {p.images.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {p.images.map((uri) => <Photo key={uri} uri={uri} style={{ width, height: width * 0.8 }} />)}
        </ScrollView>
      ) : (
        <Photo uri={null} style={{ width, height: width * 0.6 }} label={p.category} />
      )}
      {p.images.length > 1 ? <Text style={[ui.meta, { textAlign: "center", marginTop: 6 }]}>{p.images.length} photos · swipe</Text> : null}

      <View style={{ padding: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Chip tone="brand">{p.category}</Chip>
          <Chip>{p.condition}</Chip>
          {p.status !== "ACTIVE" ? <Chip tone="warn">{p.status === "SOLD_OUT" ? "Sold out" : p.status.toLowerCase()}</Chip> : null}
        </View>
        <Text style={ui.h1}>{p.title}</Text>
        <Text style={styles.price}>{rupees(p.pricePaise)}</Text>
        <Text style={ui.body}>{p.description}</Text>

        <Card style={{ padding: 14, gap: 4, marginTop: 8 }}>
          <Text style={ui.eyebrow}>Seller</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Photo uri={p.seller.avatarUrl} style={styles.avatar} label={p.seller.name[0]} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{p.seller.name}</Text>
              <Text style={ui.meta}>{[p.city, formatDistance(distance)].filter(Boolean).join(" · ")} · listed {timeAgo(p.createdAt)}</Text>
            </View>
          </View>
        </Card>

        <Text style={ui.meta}>{p.stock === 0 ? "Out of stock" : `${p.stock} in stock`}{inCart ? ` · ${inCart} in your cart` : ""}</Text>

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        {mine ? (
          <View style={ui.row}>
            <Button label="Edit your listing" onPress={() => router.push({ pathname: "/selling/edit", params: { id: p.id } })} />
          </View>
        ) : buyable ? (
          <>
            <View style={styles.qty}>
              <Text style={ui.label}>Quantity</Text>
              <SmallButton label="−" onPress={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1} />
              <Text style={styles.qtyValue}>{qty}</Text>
              <SmallButton label="+" onPress={() => setQty((n) => Math.min(max - inCart, n + 1))} disabled={qty + inCart >= max} />
            </View>
            <View style={ui.row}>
              <Button variant="secondary" label="View cart" onPress={() => router.push("/cart")} />
              <Button label={busy ? "Adding…" : inCart >= p.stock ? "All in cart" : "Add to cart"} onPress={addToCart} disabled={busy || inCart >= p.stock} />
            </View>
          </>
        ) : (
          <Notice tone="warn">This listing isn’t available right now.</Notice>
        )}
      </View>
    </Screen>
  );
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const styles = StyleSheet.create({
  price: { fontFamily: fonts.headingHeavy, fontSize: 26, color: c.ink },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  qty: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 8 },
  qtyValue: { minWidth: 24, textAlign: "center", fontFamily: fonts.headingHeavy, fontSize: 20, color: c.ink },
});
