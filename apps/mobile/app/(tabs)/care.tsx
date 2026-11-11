import { CARE_CATEGORIES, canOfferCare, type CareCategory, type CareQuery, type CareService } from "@proot/shared";
import { router } from "expo-router";
import { useState } from "react";
import { TextInput } from "react-native";
import { ServiceCard } from "@/components/ServiceCard";
import { c, Empty, ErrorState, Loading, NavRow, PageHead, Pills, Screen, ui } from "@/components/ui";
import { useResource } from "@/lib/hooks";
import { api, useNear, useSession } from "@/lib/session";

type Sort = NonNullable<CareQuery["sort"]>;
const SORTS: Sort[] = ["rating", "distance", "price_asc", "new"];
const SORT_LABELS: Record<Sort, string> = { rating: "Top rated", distance: "Nearest", price_asc: "Price ↑", new: "Newest" };
const ALL = "All" as const;

export default function CareScreen() {
  const { user } = useSession();
  const near = useNear();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CareCategory | typeof ALL>(ALL);
  const [sort, setSort] = useState<Sort>("rating");

  const list = useResource<CareService[]>(
    () => api.listServices({ q: search || undefined, category: category === ALL ? undefined : category, sort, ...(near ?? {}) }),
    [search, category, sort, near?.lat, near?.lng],
  );
  const sorts = near ? SORTS : SORTS.filter((s) => s !== "distance");

  return (
    <Screen onRefresh={list.reload}>
      <PageHead eyebrow="Care" title="Help that comes to the door." lede="Walks, grooming, training, and vet visits from people nearby." />
      <NavRow title="Your bookings" meta="Pay, cancel, or review" onPress={() => router.push("/bookings")} />
      {canOfferCare(user?.role) ? (
        <>
          <NavRow title="Booking requests" meta="Confirm, decline, or complete visits" onPress={() => router.push("/provider/bookings")} />
          <NavRow title="Your services" meta="Add or edit what you offer" onPress={() => router.push("/provider/services")} />
        </>
      ) : null}

      <TextInput
        value={q}
        onChangeText={setQ}
        onEndEditing={() => setSearch(q.trim())}
        onSubmitEditing={() => setSearch(q.trim())}
        placeholder="Search care"
        placeholderTextColor={c.muted}
        returnKeyType="search"
        style={[ui.input, { marginVertical: 12 }]}
      />
      <Pills options={[ALL, ...CARE_CATEGORIES] as const} value={category} onChange={setCategory} />
      <Pills options={sorts} value={sort} onChange={setSort} labels={SORT_LABELS} />

      {list.loading ? <Loading /> : list.error && !list.data ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {list.data?.length === 0 ? <Empty title="No care listed here yet." text="Try another category." /> : null}
      {list.data?.map((s) => <ServiceCard key={s.id} service={s} />)}
    </Screen>
  );
}
