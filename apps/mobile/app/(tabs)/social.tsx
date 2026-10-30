import { events, nearbyPets, parks } from "@proot/shared";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, c, Card, Chip, fonts, PageHead, r, Screen, SectionLabel, ui } from "@/components/ui";
import { LiveEvents } from "@/components/LiveEvents";

export default function SocialScreen() {
  const [i, setI] = useState(0);
  const pet = nearbyPets[i];

  return (
    <Screen>
      <PageHead eyebrow="Friends nearby" title="A slow hello." lede="One nearby dog at a time, with a little room to get to know them." />
      {pet ? (
        <Card>
          <View>
            <Image source={{ uri: pet.image }} style={styles.tall} />
            <Chip style={ui.overlayChip}>{pet.distanceKm} km away</Chip>
          </View>
          <View style={[ui.cardBody, { gap: 10 }]}>
            <View style={styles.progress}>
              {nearbyPets.map((item, idx) => (
                <View key={item.id} style={[styles.bar, idx <= i && { backgroundColor: c.brand }]} />
              ))}
            </View>
            <Text style={[ui.title, { fontSize: 28, lineHeight: 32 }]}>{pet.name}</Text>
            <Text style={ui.meta}>{pet.breed} · {pet.age}</Text>
            <Text style={ui.body}>{pet.bio}</Text>
            <View style={styles.prompt}>
              <Text style={styles.promptQ}>{pet.prompt}</Text>
              <Text style={styles.promptA}>“{pet.answer}”</Text>
            </View>
            <View style={[ui.row, { marginTop: 4 }]}>
              <Button variant="secondary" label="Not now" onPress={() => setI((n) => n + 1)} />
              <Button label="Say hi" onPress={() => setI((n) => n + 1)} />
            </View>
          </View>
        </Card>
      ) : (
        <Card style={styles.empty}>
          <Text style={ui.title}>That’s the block for today.</Text>
          <Text style={ui.body}>Come back after a walk.</Text>
          <Button variant="secondary" label="See dogs again" style={{ flex: 0, marginTop: 8 }} onPress={() => setI(0)} />
        </Card>
      )}

      <LiveEvents />

      <SectionLabel>Proot picks</SectionLabel>
      {events.map((e) => (
        <View key={e.id} style={ui.listItem}>
          <Image source={{ uri: e.image }} style={styles.thumb} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>{e.title}</Text>
            <Text style={ui.meta}>{e.when} · {e.neighborhood}</Text>
          </View>
          <Chip tone="brand">{e.spots} spots</Chip>
        </View>
      ))}

      <SectionLabel>Parks</SectionLabel>
      {parks.map((p) => (
        <View key={p.id} style={ui.listItem}>
          <Image source={{ uri: p.image }} style={styles.thumb} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>{p.name}</Text>
            <Text style={ui.meta}>{p.distanceKm} km · {p.hours}</Text>
          </View>
          <Chip tone="good">● {p.dogsNow} now</Chip>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tall: { width: "100%", height: 320, backgroundColor: c.surface2 },
  progress: { flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line },
  prompt: { padding: 14, borderLeftWidth: 3, borderLeftColor: c.accent, borderRadius: r.sm, backgroundColor: c.accentSoft },
  promptQ: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.ink },
  promptA: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: c.inkSoft, marginTop: 4 },
  empty: { padding: 28, alignItems: "center", gap: 6 },
  thumb: { width: 52, height: 52, borderRadius: r.sm, backgroundColor: c.surface2 },
  rowTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: c.ink },
});
