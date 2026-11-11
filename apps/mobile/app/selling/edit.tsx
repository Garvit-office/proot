import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  toPaise,
  type ProductCategory,
  type ProductCondition,
  type ProductInput,
} from "@proot/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, c, ErrorState, Field, fonts, Loading, Notice, Photo, Pills, r, SectionLabel, SmallButton, ui } from "@/components/ui";
import { errorText } from "@/lib/hooks";
import { pickPhoto, pickPhotos } from "@/lib/photo";
import { api, useSession } from "@/lib/session";

type Status = ProductInput["status"];
const STATUSES: Status[] = ["ACTIVE", "DRAFT", "ARCHIVED"];
const STATUS_LABELS: Record<Status, string> = { ACTIVE: "Live", DRAFT: "Draft", ARCHIVED: "Archived" };

type Form = { title: string; description: string; category: ProductCategory; condition: ProductCondition; price: string; stock: string; status: Status; images: string[]; city: string };

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useSession();
  const [form, setForm] = useState<Form>({ title: "", description: "", category: "Toys", condition: "Like new", price: "", stock: "1", status: "ACTIVE", images: [], city: user?.city ?? "" });
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id)
      .then((p) => {
        setForm({
          title: p.title,
          description: p.description,
          category: p.category,
          condition: p.condition,
          price: String(p.pricePaise / 100),
          stock: String(p.stock),
          status: p.status === "ACTIVE" || p.status === "DRAFT" || p.status === "ARCHIVED" ? p.status : "ACTIVE",
          images: p.images,
          city: p.city,
        });
      })
      .catch((err) => setLoadError(errorText(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const room = MAX_PRODUCT_IMAGES - form.images.length;

  async function addPhotos(source: "camera" | "library") {
    setError("");
    try {
      const added = source === "camera" ? [await pickPhoto("camera")].filter((x): x is string => !!x) : await pickPhotos(room);
      setForm((f) => ({ ...f, images: [...f.images, ...added].slice(0, MAX_PRODUCT_IMAGES) }));
    } catch (err) {
      setError(errorText(err, "Couldn’t read that photo."));
    }
  }

  function moveToFront(i: number) {
    setForm((f) => ({ ...f, images: [f.images[i], ...f.images.filter((_, j) => j !== i)] }));
  }

  async function save() {
    const pricePaise = toPaise(form.price);
    const stock = Number(form.stock);
    if (!form.title.trim()) return setError("Give it a title.");
    if (!form.description.trim()) return setError("Add a short description.");
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) return setError("Enter a price in rupees.");
    if (!Number.isInteger(stock) || stock < 0) return setError("Stock is a whole number.");
    const body: ProductInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      condition: form.condition,
      pricePaise,
      stock,
      status: form.status,
      images: form.images,
      city: form.city.trim() || undefined,
      ...(id ? {} : { lat: user?.lat ?? null, lng: user?.lng ?? null }),
    };
    setBusy(true);
    setError("");
    try {
      const saved = id ? await api.updateProduct(id, body) : await api.createProduct(body);
      router.replace({ pathname: "/product/[id]", params: { id: saved.id } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: id ? "Edit listing" : "New listing" }} />
      <ScrollView style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <SectionLabel style={{ marginTop: 0 }}>Photos · {form.images.length}/{MAX_PRODUCT_IMAGES}</SectionLabel>
        <View style={styles.grid}>
          {form.images.map((uri, i) => (
            <View key={`${i}-${uri.slice(-24)}`} style={styles.tile}>
              <Photo uri={uri} style={styles.tileImage} />
              {i === 0 ? <Text style={styles.cover}>Cover</Text> : null}
              <View style={styles.tileActions}>
                {i > 0 ? <Pressable onPress={() => moveToFront(i)} hitSlop={6}><Text style={styles.tileAction}>★</Text></Pressable> : null}
                <Pressable onPress={() => set("images", form.images.filter((_, j) => j !== i))} hitSlop={6} accessibilityLabel="Remove photo"><Text style={styles.tileAction}>✕</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
        {room > 0 ? (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <SmallButton label="Camera" onPress={() => addPhotos("camera")} />
            <SmallButton label="Library" onPress={() => addPhotos("library")} />
          </View>
        ) : null}

        <Field label="Title" value={form.title} onChangeText={(v) => set("title", v)} maxLength={120} placeholder="Rope tug, barely used" />
        <Field label="Description" value={form.description} onChangeText={(v) => set("description", v)} maxLength={2000} multiline />
        <Text style={ui.label}>Category</Text>
        <Pills options={PRODUCT_CATEGORIES} value={form.category} onChange={(v) => set("category", v)} style={{ marginTop: 6 }} />
        <Text style={ui.label}>Condition</Text>
        <Pills options={PRODUCT_CONDITIONS} value={form.condition} onChange={(v) => set("condition", v)} style={{ marginTop: 6 }} />
        <View style={ui.row}>
          <View style={{ flex: 1 }}><Field label="Price (₹)" value={form.price} onChangeText={(v) => set("price", v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" maxLength={9} /></View>
          <View style={{ flex: 1 }}><Field label="Stock" value={form.stock} onChangeText={(v) => set("stock", v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={5} /></View>
        </View>
        <Field label="City" value={form.city} onChangeText={(v) => set("city", v)} maxLength={80} />
        <Text style={ui.label}>Visibility</Text>
        <Pills options={STATUSES} value={form.status} onChange={(v) => set("status", v)} labels={STATUS_LABELS} style={{ marginTop: 6 }} />

        {error ? <Notice>{error}</Notice> : null}
        <View style={ui.row}>
          <Button variant="secondary" label="Cancel" onPress={() => router.back()} />
          <Button label={busy ? "Saving…" : id ? "Save" : form.status === "ACTIVE" ? "Publish" : "Save"} onPress={save} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  tile: { width: 96, height: 96, borderRadius: r.sm, overflow: "hidden" },
  tileImage: { width: 96, height: 96 },
  cover: { position: "absolute", left: 4, bottom: 4, paddingHorizontal: 6, borderRadius: 6, backgroundColor: c.brand, color: "#fff", fontFamily: fonts.sansSemi, fontSize: 10.5 },
  tileActions: { position: "absolute", top: 4, right: 4, flexDirection: "row", gap: 4 },
  tileAction: { width: 24, height: 24, borderRadius: 12, textAlign: "center", lineHeight: 24, backgroundColor: "rgba(255,255,255,0.92)", color: c.ink, fontSize: 12, overflow: "hidden" },
});
