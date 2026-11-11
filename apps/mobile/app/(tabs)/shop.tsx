import { formatDistance, PRODUCT_CATEGORIES, rupees, type Page, type Product, type ProductCategory, type ProductQuery } from "@proot/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Badge, c, Card, Chip, Empty, ErrorState, fonts, Loading, PageHead, Photo, Pills, r, Screen, SmallButton, ui } from "@/components/ui";
import { useResource } from "@/lib/hooks";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { api, useNear } from "@/lib/session";

type Sort = NonNullable<ProductQuery["sort"]>;
const SORTS: Sort[] = ["new", "price_asc", "price_desc", "distance"];
const SORT_LABELS: Record<Sort, string> = { new: "Newest", price_asc: "Price ↑", price_desc: "Price ↓", distance: "Nearest" };
const ALL = "All" as const;
const PAGE = 30;

export default function ShopScreen() {
  const near = useNear();
  const { cartCount } = useRealtime();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | typeof ALL>(ALL);
  const [sort, setSort] = useState<Sort>("new");
  const [more, setMore] = useState(false);

  const list = useResource<Page<Product>>(
    () => api.listProducts({ q: search || undefined, category: category === ALL ? undefined : category, sort, limit: PAGE, ...(near ?? {}) }),
    [search, category, sort, near?.lat, near?.lng],
  );

  useRealtimeEvent("product:updated", (p) => {
    list.setData((page) => {
      if (!page) return page;
      const gone = p.deleted || p.status !== "ACTIVE";
      const items = gone ? page.items.filter((x) => x.id !== p.id) : page.items.map((x) => (x.id === p.id ? { ...x, stock: p.stock, status: p.status as Product["status"] } : x));
      return { ...page, items, total: page.total - (page.items.length - items.length) };
    });
  });

  async function loadMore() {
    if (!list.data) return;
    setMore(true);
    try {
      const next = await api.listProducts({ q: search || undefined, category: category === ALL ? undefined : category, sort, limit: PAGE, offset: list.data.items.length, ...(near ?? {}) });
      list.setData((page) => (page ? { ...next, items: [...page.items, ...next.items.filter((n) => !page.items.some((p) => p.id === n.id))] } : next));
    } finally {
      setMore(false);
    }
  }

  const sorts = near ? SORTS : SORTS.filter((s) => s !== "distance");

  return (
    <Screen onRefresh={list.reload}>
      <PageHead eyebrow="Shop" title="Fewer, better things." lede="New and pre-loved essentials from people nearby." />

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => router.push("/cart")} accessibilityRole="button">
          <Text style={styles.actionText}>Cart</Text>
          <Badge count={cartCount} />
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push("/orders")} accessibilityRole="button">
          <Text style={styles.actionText}>Orders</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push("/selling")} accessibilityRole="button">
          <Text style={styles.actionText}>Sell</Text>
        </Pressable>
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => setSearch(q.trim())}
        placeholder="Search listings"
        placeholderTextColor={c.muted}
        returnKeyType="search"
        style={[ui.input, { marginBottom: 12 }]}
        clearButtonMode="while-editing"
        onEndEditing={() => setSearch(q.trim())}
      />
      <Pills options={[ALL, ...PRODUCT_CATEGORIES] as const} value={category} onChange={setCategory} />
      <Pills options={sorts} value={sort} onChange={setSort} labels={SORT_LABELS} />

      {list.loading ? <Loading /> : list.error && !list.data ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {list.data?.items.length === 0 ? <Empty title="Nothing here yet." text={search ? "Try a different search." : "Check back soon, or list something yourself."} /> : null}

      {list.data?.items.map((p) => <ProductCard key={p.id} product={p} />)}

      {list.data && list.data.items.length < list.data.total ? (
        <View style={{ alignItems: "center" }}>
          <SmallButton label={more ? "Loading…" : "Load more"} onPress={loadMore} disabled={more} />
        </View>
      ) : null}
    </Screen>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })} accessibilityRole="button" accessibilityLabel={`${p.title}, ${rupees(p.pricePaise)}`}>
      <Card>
        <View>
          <Photo uri={p.images[0]} style={ui.cardImage} label={p.category} />
          <Chip style={ui.overlayChip}>{p.category}</Chip>
        </View>
        <View style={ui.cardBody}>
          <Text style={ui.title}>{p.title}</Text>
          <Text style={ui.meta}>
            {[p.condition, p.seller.name, formatDistance(p.distanceKm) || p.city].filter(Boolean).join(" · ")}
          </Text>
          <View style={ui.cardFoot}>
            <Text style={ui.price}>{rupees(p.pricePaise)}</Text>
            <Chip tone={p.stock === 0 ? "bad" : p.stock <= 3 ? "warn" : "good"}>{p.stock === 0 ? "Sold out" : p.stock <= 3 ? `Only ${p.stock} left` : "In stock"}</Chip>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, marginBottom: 14 },
  action: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: r.pill,
    backgroundColor: c.brandSoft,
  },
  actionText: { fontFamily: fonts.sansSemi, fontSize: 14, color: c.brand },
});
