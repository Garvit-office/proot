import { rupees, type AddressInput, type AddressRecord, type CheckoutInput } from "@proot/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { addressLines, addressProblem, AddressForm, blankAddress } from "@/components/AddressForm";
import { Button, c, Card, ErrorState, Line, Loading, Notice, r, Screen, SectionLabel, ui } from "@/components/ui";
import { errorText, useResource } from "@/lib/hooks";
import { pay } from "@/lib/payments";
import { useRealtime } from "@/lib/realtime";
import { api, useSession } from "@/lib/session";

export default function CheckoutScreen() {
  const { user } = useSession();
  const { setCartCount } = useRealtime();
  const cart = useResource(() => api.getCart(), []);
  const addresses = useResource<AddressRecord[]>(() => api.listAddresses(), []);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<AddressInput>(() => blankAddress(user?.name, user?.phone, user?.city));
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Default to the default address, or the new-address form when there are none.
  useEffect(() => {
    if (selected !== null || !addresses.data) return;
    const preferred = addresses.data.find((a) => a.isDefault) ?? addresses.data[0];
    setSelected(preferred ? preferred.id : "new");
  }, [addresses.data, selected]);

  async function placeOrder() {
    let body: CheckoutInput;
    if (selected === "new") {
      const problem = addressProblem(draft);
      if (problem) return setError(problem);
      const { label: _label, isDefault: _isDefault, ...address } = draft;
      body = { address, saveAddress: save };
    } else if (selected) {
      body = { addressId: selected };
    } else return setError("Choose where to ship it.");

    setBusy(true);
    setError("");
    try {
      const { order, payment } = await api.checkout(body);
      setCartCount(0);
      const outcome = await pay(async () => payment);
      router.replace({ pathname: "/orders/[id]", params: { id: order.id, notice: outcome.kind === "paid" ? "Payment received. Thank you!" : outcome.message } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (cart.loading || addresses.loading) return <Loading />;
  if (!cart.data) return <ErrorState message={cart.error || addresses.error} onRetry={() => { cart.reload(); addresses.reload(); }} />;
  if (cart.data.items.length === 0) return <ErrorState message="Your cart is empty." />;

  return (
    <Screen>
      <SectionLabel style={{ marginTop: 0 }}>Ship to</SectionLabel>
      {addresses.data?.map((a) => (
        <Pressable key={a.id} onPress={() => setSelected(a.id)} accessibilityRole="radio" accessibilityState={{ selected: selected === a.id }}>
          <Card style={[styles.option, selected === a.id && styles.optionOn]}>
            <Text style={ui.rowTitle}>{a.label}{a.isDefault ? " · default" : ""}</Text>
            <Text style={ui.body}>{addressLines(a)}</Text>
          </Card>
        </Pressable>
      ))}
      <Pressable onPress={() => setSelected("new")} accessibilityRole="radio" accessibilityState={{ selected: selected === "new" }}>
        <Card style={[styles.option, selected === "new" && styles.optionOn]}>
          <Text style={ui.rowTitle}>{addresses.data?.length ? "Use a new address" : "Shipping address"}</Text>
        </Card>
      </Pressable>
      {selected === "new" ? (
        <Card style={{ padding: 16 }}>
          <AddressForm value={draft} onChange={setDraft} withMeta={false} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={[ui.label, { flex: 1 }]}>Save to my addresses</Text>
            <Switch value={save} onValueChange={setSave} trackColor={{ true: c.brand, false: c.lineStrong }} />
          </View>
        </Card>
      ) : null}

      <SectionLabel>Summary</SectionLabel>
      <Card style={{ padding: 16, gap: 8 }}>
        {cart.data.items.map((i) => <Line key={i.product.id} label={`${i.quantity} × ${i.product.title}`} value={rupees(i.lineTotalPaise)} />)}
        <View style={{ height: 1, backgroundColor: c.line }} />
        <Line label="Shipping" value={cart.data.shippingPaise ? rupees(cart.data.shippingPaise) : "Free"} />
        <Line label="Total" value={rupees(cart.data.totalPaise)} strong />
      </Card>

      {error ? <Notice>{error}</Notice> : null}
      <View style={ui.row}>
        <Button label={busy ? "Placing order…" : `Pay ${rupees(cart.data.totalPaise)}`} onPress={placeOrder} disabled={busy} />
      </View>
      <Text style={[ui.meta, { marginTop: 10, textAlign: "center" }]}>You’ll finish paying on a secure Razorpay page.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { padding: 14, gap: 4, marginBottom: 8, borderRadius: r.sm + 4 },
  optionOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
});
