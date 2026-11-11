import type { AddressInput } from "@proot/shared";
import { Switch, Text, View } from "react-native";
import { c, Field, ui } from "@/components/ui";

export const blankAddress = (name = "", phone = "", city = ""): AddressInput => ({
  label: "Home",
  fullName: name,
  phone,
  line1: "",
  line2: "",
  city,
  state: "",
  pincode: "",
  isDefault: false,
});

/** Returns a message for the first missing field, or "" when the address is complete. */
export function addressProblem(a: Pick<AddressInput, "fullName" | "phone" | "line1" | "city" | "state" | "pincode">) {
  if (!a.fullName.trim()) return "Add the recipient’s name.";
  if (!/^[+\d][\d\s()-]{5,19}$/.test(a.phone.trim())) return "Add a valid phone number.";
  if (!a.line1.trim()) return "Add the street address.";
  if (!a.city.trim()) return "Add the city.";
  if (!a.state.trim()) return "Add the state.";
  if (!/^\d{6}$/.test(a.pincode.trim())) return "PIN codes are 6 digits.";
  return "";
}

export function AddressForm({
  value,
  onChange,
  withMeta = true,
}: {
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  /** Show the label and default switch (address book), or hide them (one-off shipping address). */
  withMeta?: boolean;
}) {
  const set = <K extends keyof AddressInput>(key: K, v: AddressInput[K]) => onChange({ ...value, [key]: v });
  return (
    <View>
      {withMeta ? <Field label="Label" value={value.label} onChangeText={(v) => set("label", v)} placeholder="Home, Work…" maxLength={40} /> : null}
      <Field label="Full name" value={value.fullName} onChangeText={(v) => set("fullName", v)} autoComplete="name" maxLength={80} />
      <Field label="Phone" value={value.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" autoComplete="tel" maxLength={20} />
      <Field label="Address line 1" value={value.line1} onChangeText={(v) => set("line1", v)} placeholder="House, street" maxLength={160} />
      <Field label="Address line 2 (optional)" value={value.line2} onChangeText={(v) => set("line2", v)} placeholder="Area, landmark" maxLength={160} />
      <View style={ui.row}>
        <View style={{ flex: 1 }}><Field label="City" value={value.city} onChangeText={(v) => set("city", v)} maxLength={80} /></View>
        <View style={{ flex: 1 }}><Field label="State" value={value.state} onChangeText={(v) => set("state", v)} maxLength={80} /></View>
      </View>
      <Field label="PIN code" value={value.pincode} onChangeText={(v) => set("pincode", v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} />
      {withMeta ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Text style={[ui.label, { flex: 1 }]}>Use as default</Text>
          <Switch value={value.isDefault} onValueChange={(v) => set("isDefault", v)} trackColor={{ true: c.brand, false: c.lineStrong }} />
        </View>
      ) : null}
    </View>
  );
}

export function addressLines(a: Pick<AddressInput, "fullName" | "phone" | "line1" | "line2" | "city" | "state" | "pincode">) {
  return [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`, a.phone].filter((x) => x && x.trim()).join("\n");
}
