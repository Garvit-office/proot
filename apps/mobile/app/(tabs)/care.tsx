import { careServices, inr } from "@proot/shared";
import { Image, Text, View } from "react-native";
import { c, Card, Chip, PageHead, Screen, ui } from "@/components/ui";

export default function CareScreen() {
  return (
    <Screen>
      <PageHead eyebrow="Care" title="Help that comes to the door." lede="Walks, grooming, and wellness visits with people who know dogs." />
      {careServices.map((s) => (
        <Card key={s.id}>
          <View>
            <Image source={{ uri: s.image }} style={ui.cardImage} />
            <Chip style={ui.overlayChip}>{s.category}</Chip>
          </View>
          <View style={ui.cardBody}>
            <Text style={ui.title}>{s.title}</Text>
            <Text style={ui.meta}>★ {s.rating} ({s.reviews} reviews) · {s.duration}</Text>
            <Text style={ui.body}>{s.blurb}</Text>
            <View style={ui.cardFoot}>
              <Text style={ui.price}>
                <Text style={ui.meta}>From </Text>
                {inr(s.priceFrom)}
              </Text>
              <Text style={[ui.meta, { color: c.brand }]}>{s.pro}</Text>
            </View>
          </View>
        </Card>
      ))}
      <Text style={ui.meta}>Online booking is not available yet.</Text>
    </Screen>
  );
}
