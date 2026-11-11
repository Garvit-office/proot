import { formatDistance, formatDuration, rupees, timeAgo, type CareServiceDetail } from "@proot/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";
import { Button, Card, Chip, ErrorState, Loading, Notice, Photo, Screen, SectionLabel, ui } from "@/components/ui";
import { useResource } from "@/lib/hooks";
import { api, useSession } from "@/lib/session";

export default function ServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const service = useResource<CareServiceDetail>(() => api.getService(id), [id]);
  const s = service.data;

  if (service.loading) return <Loading />;
  if (!s) return <ErrorState message={service.error || "Service not found."} onRetry={service.reload} />;
  const mine = user?.id === s.provider.id;

  return (
    <Screen onRefresh={service.reload} contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}>
      <Stack.Screen options={{ title: s.title }} />
      <Photo uri={s.imageUrl} style={{ width, height: width * 0.62 }} label={s.category} />
      <View style={{ padding: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip tone="brand">{s.category}</Chip>
          {!s.isActive ? <Chip tone="warn">Paused</Chip> : null}
        </View>
        <Text style={ui.h1}>{s.title}</Text>
        <Text style={ui.meta}>
          {s.ratingCount ? `★ ${s.ratingAvg.toFixed(1)} · ${s.ratingCount} review${s.ratingCount === 1 ? "" : "s"}` : "No reviews yet"} · {formatDuration(s.durationMin)}
        </Text>
        <Text style={ui.price}>{rupees(s.pricePaise)}</Text>
        <Text style={ui.body}>{s.description}</Text>

        <Card style={{ padding: 14, gap: 6, marginTop: 8 }}>
          <Text style={ui.eyebrow}>Provider</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Photo uri={s.provider.avatarUrl} style={{ width: 40, height: 40, borderRadius: 20 }} label={s.provider.name[0]} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{s.provider.name}</Text>
              <Text style={ui.meta}>{[s.city, formatDistance(s.distanceKm), `serves within ${s.serviceRadiusKm} km`].filter(Boolean).join(" · ")}</Text>
            </View>
          </View>
        </Card>

        {mine ? (
          <View style={ui.row}><Button variant="secondary" label="Edit this service" onPress={() => router.push({ pathname: "/provider/service-edit", params: { id: s.id } })} /></View>
        ) : s.isActive ? (
          <View style={ui.row}><Button label="Choose a time" onPress={() => router.push({ pathname: "/book/[id]", params: { id: s.id } })} /></View>
        ) : (
          <Notice tone="warn">This service is paused and isn’t taking bookings.</Notice>
        )}

        <SectionLabel>Reviews</SectionLabel>
        {s.reviews.length === 0 ? <Text style={ui.body}>No reviews yet.</Text> : null}
        {s.reviews.map((rv) => (
          <Card key={rv.id} style={{ padding: 14, gap: 4 }}>
            <View style={ui.headRow}>
              <Text style={ui.rowTitle}>{rv.user.name}</Text>
              <Text style={ui.meta}>{"★".repeat(rv.rating)}{"☆".repeat(5 - rv.rating)}</Text>
            </View>
            {rv.comment ? <Text style={ui.body}>{rv.comment}</Text> : null}
            <Text style={ui.meta}>{timeAgo(rv.createdAt)}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
