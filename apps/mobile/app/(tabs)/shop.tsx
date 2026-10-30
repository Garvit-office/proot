import { inr, products } from "@proot/shared";
import { Image, Text, View } from "react-native";
import { Card, Chip, PageHead, Screen, ui } from "@/components/ui";

export default function ShopScreen() {
  return (
    <Screen>
      <PageHead eyebrow="Shop" title="Fewer, better things." lede="Everyday essentials chosen for a long life together." />
      {products.map((p) => (
        <Card key={p.id}>
          <View>
            <Image source={{ uri: p.image }} style={ui.cardImage} />
            <Chip style={ui.overlayChip}>{p.category}</Chip>
          </View>
          <View style={ui.cardBody}>
            <Text style={ui.title}>{p.name}</Text>
            <Text style={ui.body}>{p.blurb}</Text>
            <View style={ui.cardFoot}>
              <Text style={ui.price}>{inr(p.price)}</Text>
              <Chip tone="neutral">Checkout soon</Chip>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
