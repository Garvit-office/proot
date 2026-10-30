import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { c, fonts, ui } from "@/components/ui";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <Text style={ui.eyebrow}>404</Text>
        <Text style={styles.title}>This screen is not available.</Text>
        <Link href="/" style={styles.link}>
          Back to home →
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.bg },
  title: { marginTop: 8, fontFamily: fonts.heading, fontSize: 24, color: c.ink, textAlign: "center" },
  link: { marginTop: 18, fontFamily: fonts.sansSemi, fontSize: 15, color: c.brand },
});
