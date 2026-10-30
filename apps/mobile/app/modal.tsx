import { userPet } from "@proot/shared";
import { useSession } from "@/lib/session";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { c, Chip, fonts, Mark, ui } from "@/components/ui";

export default function ModalScreen() {
  const pet = useSession().pet ?? userPet;
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Mark size={84} />
      <Text style={[ui.eyebrow, { marginTop: 18 }]}>Proot</Text>
      <Text style={styles.title}>A little more about {pet.name}.</Text>
      <View style={styles.chips}>
        <Chip tone="brand">{pet.breed}</Chip>
        <Chip tone="accent">{pet.age}</Chip>
        <Chip>{pet.weightKg} kg</Chip>
      </View>
      <Text style={[ui.lede, { textAlign: "center", maxWidth: 320 }]}>
        Their profile, care notes, and neighborhood activity will live here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: c.bg },
  title: { marginTop: 8, fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: c.ink, textAlign: "center" },
  chips: { flexDirection: "row", gap: 8, marginTop: 14 },
});
