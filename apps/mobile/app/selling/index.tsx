import { rupees, type ListingStatus, type Page, type Product } from "@proot/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Chip, Empty, ErrorState, Loading, NavRow, Notice, Photo, r, Screen, SmallButton, ui, type Tone } from "@/components/ui";
import { confirm } from "@/lib/confirm";
import { errorText, useResource } from "@/lib/hooks";
import { useRealtimeEvent } from "@/lib/realtime";
import { api } from "@/lib/session";

const statusTone: Record<ListingStatus, Tone> = { ACTIVE: "good", DRAFT: "warn", SOLD_OUT: "bad", ARCHIVED: "neutral", REMOVED: "bad" };
const statusLabel: Record<ListingStatus, string> = { ACTIVE: "Live", DRAFT: "Draft", SOLD_OUT: "Sold out", ARCHIVED: "Archived", REMOVED: "Removed by Proot" };

export default function SellingScreen() {
  const list = useResource<Page<Product>>(() => api.listProducts({ mine: true, limit: 100 }), [], { focus: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useRealtimeEvent("product:updated", (p) => {
    list.setData((page) => page && { ...page, items: page.items.map((x) => (x.id === p.id ? { ...x, stock: p.stock, status: p.status as ListingStatus } : x)) });
  });

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try {
      await action();
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Product) {
    if (await confirm(`Delete “${p.title}”?`, "This can’t be undone. Past orders keep their details.", "Delete")) run(p.id, () => api.deleteProduct(p.id));
  }

  return (
    <Screen onRefresh={list.reload}>
      <View style={ui.row}><Button label="+ New listing" onPress={() => router.push("/selling/edit")} /></View>
      <View style={{ height: 12 }} />
      <NavRow title="Orders to fulfil" meta="Ship and deliver what you’ve sold" onPress={() => router.push("/selling/orders")} />
      {error ? <Notice>{error}</Notice> : null}
      {list.loading ? <Loading /> : list.error && !list.data ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {list.data?.items.length === 0 ? <Empty title="You haven’t listed anything." text="Sell what your dog has outgrown — up to 6 photos per listing." /> : null}
      {list.data?.items.map((p) => (
        <Card key={p.id} style={{ padding: 12, gap: 10 }}>
          <Pressable style={{ flexDirection: "row", gap: 12 }} onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}>
            <Photo uri={p.images[0]} style={{ width: 64, height: 64, borderRadius: r.sm }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={ui.rowTitle} numberOfLines={2}>{p.title}</Text>
              <Text style={ui.meta}>{rupees(p.pricePaise)} · {p.stock} in stock</Text>
              <Chip tone={statusTone[p.status]}>{statusLabel[p.status]}</Chip>
            </View>
          </Pressable>
          {p.status !== "REMOVED" ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <SmallButton label="Edit" onPress={() => router.push({ pathname: "/selling/edit", params: { id: p.id } })} />
              {p.status === "ARCHIVED" || p.status === "DRAFT" ? (
                <SmallButton label="Publish" tone="brand" disabled={busy === p.id} onPress={() => run(p.id, () => api.updateProduct(p.id, { status: "ACTIVE" }))} />
              ) : (
                <SmallButton label="Archive" disabled={busy === p.id} onPress={() => run(p.id, () => api.updateProduct(p.id, { status: "ARCHIVED" }))} />
              )}
              <SmallButton label="Delete" tone="bad" disabled={busy === p.id} onPress={() => remove(p)} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
