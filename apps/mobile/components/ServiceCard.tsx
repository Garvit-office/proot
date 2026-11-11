import { formatDistance, formatDuration, rupees, type CareService } from "@proot/shared";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { c, Card, Chip, Photo, ui } from "@/components/ui";

export function ServiceCard({ service: s }: { service: CareService }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/service/[id]", params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={s.title}>
      <Card>
        <View>
          <Photo uri={s.imageUrl} style={ui.cardImage} label={s.category} />
          <Chip style={ui.overlayChip}>{s.category}</Chip>
        </View>
        <View style={ui.cardBody}>
          <Text style={ui.title}>{s.title}</Text>
          <Text style={ui.meta}>
            {s.ratingCount ? `★ ${s.ratingAvg.toFixed(1)} (${s.ratingCount})` : "New"} · {formatDuration(s.durationMin)}
            {s.distanceKm != null ? ` · ${formatDistance(s.distanceKm)}` : s.city ? ` · ${s.city}` : ""}
          </Text>
          <Text style={ui.body} numberOfLines={2}>{s.description}</Text>
          <View style={ui.cardFoot}>
            <Text style={ui.price}>{rupees(s.pricePaise)}</Text>
            <Text style={[ui.meta, { color: c.brand }]}>{s.provider.name}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
