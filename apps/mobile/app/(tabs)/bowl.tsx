import { analyzeMealFromName, userPet, verdictTone, type MealAnalysis } from "@proot/shared";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, c, Card, Chip, fonts, PageHead, r, Screen, SectionLabel, ui } from "@/components/ui";
import { useSession } from "@/lib/session";

type Logged = MealAnalysis & { photo?: string; at: string };

export default function BowlScreen() {
  const petName = useSession().pet?.name ?? userPet.name;
  const [preview, setPreview] = useState<string>();
  const [analysis, setAnalysis] = useState<MealAnalysis>();
  const [log, setLog] = useState<Logged[]>([]);
  const kcal = useMemo(() => log.reduce((s, m) => s + m.kcal, 0), [log]);

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const lib = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
      if (lib.canceled) return;
      const uri = lib.assets[0].uri;
      setPreview(uri);
      setAnalysis(analyzeMealFromName(uri));
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (shot.canceled) return;
    const uri = shot.assets[0].uri;
    setPreview(uri);
    setAnalysis(analyzeMealFromName("kibble-bowl.jpg"));
  }

  function saveMeal() {
    if (!analysis || analysis.verdict === "Skip") return;
    setLog((items) => [
      {
        ...analysis,
        photo: preview,
        at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      ...items,
    ]);
    setPreview(undefined);
    setAnalysis(undefined);
  }

  return (
    <Screen>
      <PageHead
        eyebrow="Nutrition · simulated review"
        title="Photograph dinner first."
        lede={`Snap the bowl before ${petName} eats. Feedback is simulated, not veterinary advice.`}
      />

      <Pressable style={({ pressed }) => [styles.dropzone, pressed && { backgroundColor: c.brandSoft }]} onPress={capture}>
        <Text style={styles.dropIcon}>📷</Text>
        <Text style={styles.dropTitle}>Open camera</Text>
        <Text style={ui.meta}>Or choose a photo from your library</Text>
      </Pressable>

      {preview && analysis && (
        <Card style={{ marginTop: 16 }}>
          <Image source={{ uri: preview }} style={ui.cardImage} />
          <View style={[ui.cardBody, { gap: 10 }]}>
            <Chip tone={verdictTone[analysis.verdict]}>{analysis.verdict} · simulated</Chip>
            <Text style={ui.title}>{analysis.label}</Text>
            <View style={styles.macros}>
              <Macro value={`${analysis.kcal}`} label="kcal" />
              <Macro value={`${analysis.proteinG} g`} label="protein" />
              <Macro value={`${analysis.fatG} g`} label="fat" />
            </View>
            <Text style={ui.body}>{analysis.notes}</Text>
            <View style={ui.row}>
              <Button
                label={analysis.verdict === "Skip" ? "Don’t feed this" : `Log for ${petName}`}
                disabled={analysis.verdict === "Skip"}
                onPress={saveMeal}
              />
            </View>
          </View>
        </Card>
      )}

      <SectionLabel>Today</SectionLabel>
      <Text style={styles.total}>
        {kcal} <Text style={ui.meta}>kcal · {log.length} meal{log.length === 1 ? "" : "s"}</Text>
      </Text>
      {log.map((m, idx) => (
        <View key={`${m.id}-${idx}`} style={ui.listItem}>
          {m.photo ? <Image source={{ uri: m.photo }} style={styles.thumb} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>{m.label}</Text>
            <Text style={ui.meta}>{m.at} · {m.kcal} kcal</Text>
          </View>
          <Chip tone={verdictTone[m.verdict]}>{m.verdict}</Chip>
        </View>
      ))}
    </Screen>
  );
}

function Macro({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={ui.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 28,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.lineStrong,
    borderRadius: r.md,
    backgroundColor: c.surface,
  },
  dropIcon: { fontSize: 26, marginBottom: 4 },
  dropTitle: { fontFamily: fonts.sansSemi, fontSize: 16, color: c.ink },
  macros: { flexDirection: "row", gap: 8 },
  macro: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: r.sm, backgroundColor: c.bg },
  macroValue: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  total: { fontFamily: fonts.headingHeavy, fontSize: 40, letterSpacing: -1, color: c.ink, marginBottom: 12 },
  thumb: { width: 44, height: 44, borderRadius: r.sm },
  rowTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: c.ink },
});
