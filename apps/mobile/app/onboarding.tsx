import {
  ACTIVITY_LEVELS,
  DIET_TYPES,
  ONBOARDING_STEPS,
  PET_LIMITS,
  PET_PROMPTS,
  PET_SEXES,
  POPULAR_BREEDS,
  SOCIAL_LEVELS,
  TEMPERAMENTS,
  VACCINATIONS,
  draftFromPet,
  draftToInput,
  emptyPetDraft,
  estimateDailyKcal,
  firstInvalidStep,
  formatAge,
  sizeFromWeight,
  toggleIn,
  validateStep,
  type DraftErrors,
  type OnboardingStepId,
  type PetDraft,
  type PetRecord,
} from "@proot/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PetAvatar } from "@/components/ProfileDrawer";
import { Button, c, Chip, fonts, Mark, r, ui } from "@/components/ui";
import { pickPetPhoto } from "@/lib/photo";
import { useSession } from "@/lib/session";

const STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

type Update = <K extends keyof PetDraft>(key: K, value: PetDraft[K]) => void;
type StepProps = { draft: PetDraft; errors: DraftErrors; update: Update };

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ edit?: string; new?: string }>();
  const editId = params.edit;
  const addingAnother = params.new === "1";
  const { status, onboarded, pets, savePet } = useSession();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);

  const editing = editId ? pets.find((p) => p.id === editId) ?? null : null;
  const [draft, setDraft] = useState<PetDraft>(() => (editing ? draftFromPet(editing) : emptyPetDraft()));
  const [step, setStep] = useState<OnboardingStepId>("basics");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saved, setSaved] = useState<PetRecord | null>(null);

  // Signing in to an account that already has a dog skips straight to the app.
  useEffect(() => {
    if (onboarded && !editId && !addingAnother && !saved) router.replace("/");
  }, [onboarded, editId, addingAnother, saved]);

  const update: Update = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const index = STEP_IDS.indexOf(step);
  const meta = ONBOARDING_STEPS[index];
  const canLeave = onboarded || editId || addingAnother;

  function go(next: OnboardingStepId) {
    setErrors({});
    setSubmitError("");
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function back() {
    if (index > 0) go(STEP_IDS[index - 1]);
    else if (router.canGoBack()) router.back();
  }

  async function next() {
    const found = validateStep(step, draft);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    if (step !== "review") return go(STEP_IDS[index + 1]);

    const invalid = firstInvalidStep(draft);
    if (invalid) {
      go(invalid);
      setErrors(validateStep(invalid, draft));
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      setSaved(await savePet(draftToInput(draft), editing?.id));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  if (status === "guest") return <AccountStep />;

  if (saved) {
    return (
      <View style={[styles.center, { padding: 28, gap: 12 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <PetAvatar pet={saved} size={104} />
        <Text style={[ui.h1, { textAlign: "center" }]}>
          {editId ? `${saved.name}’s profile is updated.` : `Welcome to the block, ${saved.name}.`}
        </Text>
        <Text style={[ui.lede, { textAlign: "center" }]}>
          {editId ? "Changes are live across Proot." : "Tap the avatar in the top-right any time to see their profile."}
        </Text>
        <View style={[ui.row, { alignSelf: "stretch", marginTop: 12 }]}>
          <Button label="Go to home" onPress={() => (router.canGoBack() && (editId || addingAnother) ? router.back() : router.replace("/"))} />
        </View>
      </View>
    );
  }

  if (editId && !editing) {
    return (
      <View style={[styles.center, { padding: 28, gap: 12 }]}>
        <Text style={ui.title}>We couldn’t find that dog.</Text>
        <View style={[ui.row, { alignSelf: "stretch" }]}><Button variant="secondary" label="Back" onPress={() => router.back()} /></View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: editing ? `Edit ${editing.name}` : "Set up your dog", headerBackVisible: Boolean(canLeave), gestureEnabled: Boolean(canLeave) }} />
      <View style={styles.progress} accessibilityLabel={`Step ${index + 1} of ${STEP_IDS.length}`}>
        {STEP_IDS.map((id, i) => (
          <View key={id} style={[styles.bar, i < index && { backgroundColor: c.brand }, i === index && { backgroundColor: c.accent }]} />
        ))}
      </View>

      <ScrollView ref={scrollRef} style={ui.page} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Text style={ui.eyebrow}>{meta.eyebrow} · {index + 1} of {STEP_IDS.length}</Text>
        <Text style={[ui.h1, { marginBottom: 20 }]} accessibilityRole="header">{meta.title}</Text>

        {step === "basics" && <BasicsStep draft={draft} errors={errors} update={update} />}
        {step === "body" && <BodyStep draft={draft} errors={errors} update={update} />}
        {step === "health" && <HealthStep draft={draft} errors={errors} update={update} />}
        {step === "routine" && <RoutineStep draft={draft} errors={errors} update={update} />}
        {step === "personality" && <PersonalityStep draft={draft} errors={errors} update={update} />}
        {step === "review" && <ReviewStep draft={draft} onEdit={go} />}

        {submitError ? <Text style={styles.alert} accessibilityRole="alert">{submitError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {index > 0 || canLeave ? <Button variant="secondary" label="Back" onPress={back} /> : null}
        {step === "health" ? <Button variant="secondary" label="Skip" onPress={() => go("routine")} /> : null}
        <Button
          label={step === "review" ? (saving ? "Saving…" : editing ? "Save changes" : `Create ${draft.name.trim() || "profile"}`) : "Continue"}
          onPress={next}
          disabled={saving}
          style={{ flex: 1.6 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : hint ? <Text style={ui.meta}>{hint}</Text> : null}
    </View>
  );
}

function Input({ invalid, style, ...props }: TextInputProps & { invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[styles.input, focused && { borderColor: c.brand }, invalid && { borderColor: c.bad }, props.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }, style]}
    />
  );
}

function Choice<T extends string>({
  label, options, value, onChange, error, multi,
}: {
  label: string;
  options: readonly T[];
  value: T | readonly string[] | null;
  onChange: (value: T) => void;
  error?: string;
  multi?: boolean;
}) {
  const isSelected = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o);
  return (
    <View style={styles.field} accessibilityRole={multi ? undefined : "radiogroup"} accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options}>
        {options.map((o) => {
          const selected = isSelected(o);
          return (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              style={[styles.option, selected && styles.optionOn, error && !selected && { borderColor: c.badSoft }]}
              accessibilityRole={multi ? "checkbox" : "radio"}
              accessibilityState={multi ? { checked: selected } : { selected }}
            >
              <Text style={[styles.optionText, selected && { color: c.brand }]}>{multi && selected ? "✓ " : ""}{o}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function BasicsStep({ draft, errors, update }: StepProps) {
  const [photoError, setPhotoError] = useState("");
  async function choose(source: "camera" | "library") {
    try {
      const photo = await pickPetPhoto(source);
      if (photo) update("photo", photo);
      setPhotoError("");
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Couldn’t read that photo.");
    }
  }
  return (
    <>
      <View style={styles.photoRow}>
        {draft.photo ? (
          <PetAvatar pet={{ name: draft.name || "?", photo: draft.photo }} size={88} />
        ) : (
          <View style={styles.photoEmpty}><Text style={{ fontSize: 28 }}>📷</Text></View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.label}>{draft.photo ? "Looking good." : "Add a photo (optional)"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <SmallButton label="Camera" onPress={() => choose("camera")} />
            <SmallButton label="Library" onPress={() => choose("library")} />
            {draft.photo ? <SmallButton label="Remove" onPress={() => update("photo", null)} /> : null}
          </View>
          {photoError || errors.photo ? <Text style={styles.error}>{photoError || errors.photo}</Text> : null}
        </View>
      </View>

      <Field label="Name" error={errors.name}>
        <Input value={draft.name} onChangeText={(v) => update("name", v)} placeholder="e.g. Maple" maxLength={PET_LIMITS.nameMax} invalid={!!errors.name} autoCapitalize="words" />
      </Field>
      <Field label="Breed" error={errors.breed}>
        <Input value={draft.breed} onChangeText={(v) => update("breed", v)} placeholder="Type or pick below" maxLength={PET_LIMITS.breedMax} invalid={!!errors.breed} autoCapitalize="words" />
      </Field>
      <View style={[styles.options, { marginTop: -8, marginBottom: 18 }]}>
        {POPULAR_BREEDS.filter((b) => b.toLowerCase().includes(draft.breed.trim().toLowerCase()) || !draft.breed.trim()).slice(0, 8).map((b) => (
          <Pressable key={b} onPress={() => update("breed", b)} style={[styles.option, styles.optionSmall, draft.breed === b && styles.optionOn]}>
            <Text style={[styles.optionText, { fontSize: 12.5 }, draft.breed === b && { color: c.brand }]}>{b}</Text>
          </Pressable>
        ))}
      </View>
      <Choice label="Sex" options={PET_SEXES} value={draft.sex} onChange={(v) => update("sex", v)} error={errors.sex} />
    </>
  );
}

function BodyStep({ draft, errors, update }: StepProps) {
  const weight = Number(draft.weightKg.replace(",", "."));
  return (
    <>
      <View style={styles.segmented}>
        {(["birthday", "approx"] as const).map((mode) => (
          <Pressable key={mode} onPress={() => update("ageMode", mode)} style={[styles.segment, draft.ageMode === mode && styles.segmentOn]} accessibilityRole="radio" accessibilityState={{ selected: draft.ageMode === mode }}>
            <Text style={[styles.optionText, draft.ageMode === mode && { color: c.ink }]}>{mode === "birthday" ? "Exact birthday" : "Approximate age"}</Text>
          </Pressable>
        ))}
      </View>
      {draft.ageMode === "birthday" ? (
        <Field label="Birthday" error={errors.birthDate} hint={draft.birthDate.length === 10 && !validateStep("body", draft).birthDate ? `${formatAge(draft.birthDate)} old` : "YYYY-MM-DD"}>
          <Input value={draft.birthDate} onChangeText={(v) => update("birthDate", v)} placeholder="2022-06-14" keyboardType="numbers-and-punctuation" maxLength={10} invalid={!!errors.birthDate} />
        </Field>
      ) : (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Years" error={errors.ageYears}>
              <Input value={draft.ageYears} onChangeText={(v) => update("ageYears", v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="3" maxLength={2} invalid={!!errors.ageYears} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Months" error={errors.ageMonths}>
              <Input value={draft.ageMonths} onChangeText={(v) => update("ageMonths", v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="0" maxLength={2} invalid={!!errors.ageMonths} />
            </Field>
          </View>
        </View>
      )}
      <Field label="Weight (kg)" error={errors.weightKg} hint={weight > 0 ? `${sizeFromWeight(weight)} dog` : "Your best guess is fine."}>
        <Input value={draft.weightKg} onChangeText={(v) => update("weightKg", v)} keyboardType="decimal-pad" placeholder="18" maxLength={5} invalid={!!errors.weightKg} />
      </Field>
      <Choice
        label="Spayed / neutered?"
        options={["Yes", "No"] as const}
        value={draft.neutered === null ? null : draft.neutered ? "Yes" : "No"}
        onChange={(v) => update("neutered", v === "Yes")}
        error={errors.neutered}
      />
    </>
  );
}

function HealthStep({ draft, errors, update }: StepProps) {
  return (
    <>
      <Text style={[ui.body, { marginBottom: 18 }]}>Helps walkers, sitters, and vets you book through Proot. Everything here is optional.</Text>
      <Choice label="Vaccinations up to date" options={VACCINATIONS} value={draft.vaccinations} onChange={(v) => update("vaccinations", toggleIn(draft.vaccinations, v))} multi />
      <Field label="Allergies" error={errors.allergies}>
        <Input value={draft.allergies} onChangeText={(v) => update("allergies", v)} placeholder="e.g. chicken, grass pollen" maxLength={PET_LIMITS.textMax} />
      </Field>
      <Field label="Conditions or medication" error={errors.conditions}>
        <Input value={draft.conditions} onChangeText={(v) => update("conditions", v)} placeholder="e.g. daily joint supplement" maxLength={PET_LIMITS.textMax} multiline />
      </Field>
      <Field label="Vet / clinic">
        <Input value={draft.vetName} onChangeText={(v) => update("vetName", v)} placeholder="e.g. Dr. Nair" maxLength={80} />
      </Field>
      <Field label="Vet phone" error={errors.vetPhone}>
        <Input value={draft.vetPhone} onChangeText={(v) => update("vetPhone", v)} placeholder="+91 …" keyboardType="phone-pad" maxLength={20} invalid={!!errors.vetPhone} />
      </Field>
      <Field label="Microchip ID" error={errors.microchipId}>
        <Input value={draft.microchipId} onChangeText={(v) => update("microchipId", v)} placeholder="9–15 letters or digits" autoCapitalize="characters" maxLength={15} invalid={!!errors.microchipId} />
      </Field>
    </>
  );
}

function RoutineStep({ draft, errors, update }: StepProps) {
  const weight = Number(draft.weightKg.replace(",", "."));
  const kcal = draft.activityLevel ? estimateDailyKcal(weight, draft.activityLevel, Boolean(draft.neutered), draft.birthDate) : 0;
  return (
    <>
      <Choice label="Mostly eats" options={DIET_TYPES} value={draft.dietType} onChange={(v) => update("dietType", v)} error={errors.dietType} />
      <View style={styles.field}>
        <Text style={styles.label}>Meals a day</Text>
        <View style={styles.counter}>
          <SmallButton label="−" onPress={() => update("mealsPerDay", Math.max(1, draft.mealsPerDay - 1))} disabled={draft.mealsPerDay <= 1} />
          <Text style={styles.counterValue}>{draft.mealsPerDay}</Text>
          <SmallButton label="+" onPress={() => update("mealsPerDay", Math.min(4, draft.mealsPerDay + 1))} disabled={draft.mealsPerDay >= 4} />
        </View>
      </View>
      <Choice label="Activity level" options={ACTIVITY_LEVELS} value={draft.activityLevel} onChange={(v) => update("activityLevel", v)} error={errors.activityLevel} />
      {kcal > 0 ? (
        <View style={styles.callout}>
          <Text style={ui.body}>
            Roughly <Text style={{ fontFamily: fonts.sansBold, color: c.ink }}>{kcal} kcal/day</Text> — about {Math.round(kcal / draft.mealsPerDay)} per meal. A starting point, not veterinary advice.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function PersonalityStep({ draft, errors, update }: StepProps) {
  return (
    <>
      <Choice label="With other dogs" options={SOCIAL_LEVELS} value={draft.social} onChange={(v) => update("social", v)} error={errors.social} />
      <Choice label="Describe them (pick any)" options={TEMPERAMENTS} value={draft.temperament} onChange={(v) => update("temperament", toggleIn(draft.temperament, v))} multi />
      <Field label="Short bio" error={errors.bio} hint={`${draft.bio.length}/${PET_LIMITS.textMax} · shown on Friends nearby`}>
        <Input value={draft.bio} onChangeText={(v) => update("bio", v)} placeholder="Loves long sniffs and short baths." maxLength={PET_LIMITS.textMax} multiline />
      </Field>
      <Choice label="Pick a prompt" options={PET_PROMPTS} value={draft.prompt} onChange={(v) => update("prompt", v)} />
      <Field label="Their answer" error={errors.answer}>
        <Input value={draft.answer} onChangeText={(v) => update("answer", v)} placeholder="Optional" maxLength={PET_LIMITS.textMax} />
      </Field>
    </>
  );
}

function ReviewStep({ draft, onEdit }: { draft: PetDraft; onEdit: (step: OnboardingStepId) => void }) {
  const p = draftToInput(draft);
  const sections: { step: OnboardingStepId; title: string; rows: [string, string][] }[] = [
    { step: "basics", title: "Basics", rows: [["Breed", p.breed], ["Sex", p.sex]] },
    { step: "body", title: "Body", rows: [["Age", `${formatAge(p.birthDate)}${p.birthDateApprox ? " (approx.)" : ""}`], ["Weight", `${p.weightKg} kg · ${sizeFromWeight(p.weightKg)}`], ["Neutered", p.neutered ? "Yes" : "No"]] },
    { step: "health", title: "Health", rows: [["Vaccines", p.vaccinations.join(", ") || "—"], ["Allergies", p.allergies || "—"], ["Vet", [p.vetName, p.vetPhone].filter(Boolean).join(" · ") || "—"], ["Microchip", p.microchipId || "—"]] },
    { step: "routine", title: "Routine", rows: [["Diet", p.dietType], ["Meals", `${p.mealsPerDay} a day`], ["Activity", p.activityLevel]] },
    { step: "personality", title: "Personality", rows: [["With dogs", p.social], ["Traits", p.temperament.join(", ") || "—"], ["Bio", p.bio || "—"]] },
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PetAvatar pet={p} size={68} />
        <View style={{ flex: 1 }}>
          <Text style={ui.title}>{p.name}</Text>
          <Text style={ui.meta}>{p.breed} · {formatAge(p.birthDate)}</Text>
        </View>
      </View>
      {sections.map((s) => (
        <View key={s.step} style={styles.reviewCard}>
          <View style={styles.reviewHead}>
            <Text style={styles.label}>{s.title}</Text>
            <Pressable onPress={() => onEdit(s.step)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${s.title}`}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
          {s.rows.map(([k, v]) => (
            <View key={k} style={styles.reviewRow}>
              <Text style={ui.meta}>{k}</Text>
              <Text style={styles.reviewValue}>{v}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SmallButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.small, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]} accessibilityRole="button">
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

function AccountStep() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === "signup" && !name.trim()) return setError("Add your name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Passwords are at least 8 characters.");
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[ui.content, { paddingTop: 72 }]} keyboardShouldPersistTaps="handled">
        <Mark size={64} />
        <Text style={[ui.eyebrow, { marginTop: 20 }]}>Welcome to Proot</Text>
        <Text style={ui.h1}>Let’s set things up around your dog.</Text>
        <Text style={[ui.lede, { marginBottom: 24 }]}>Create an account, then tell us about your dog. It takes about two minutes.</Text>

        <View style={[styles.segmented, { marginBottom: 18 }]}>
          {(["signup", "signin"] as const).map((m) => (
            <Pressable key={m} onPress={() => { setMode(m); setError(""); }} style={[styles.segment, mode === m && styles.segmentOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
              <Text style={[styles.optionText, mode === m && { color: c.ink }]}>{m === "signup" ? "Create account" : "Sign in"}</Text>
            </Pressable>
          ))}
        </View>
        {mode === "signup" && (
          <Field label="Your name">
            <Input value={name} onChangeText={setName} autoComplete="name" textContentType="name" autoCapitalize="words" />
          </Field>
        )}
        <Field label="Email">
          <Input value={email} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input value={password} onChangeText={setPassword} secureTextEntry textContentType={mode === "signup" ? "newPassword" : "password"} onSubmitEditing={submit} />
        </Field>
        {error ? <Text style={styles.alert} accessibilityRole="alert">{error}</Text> : null}
        <View style={[ui.row, { marginTop: 4 }]}>
          <Button label={busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"} onPress={submit} disabled={busy} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 24 }}>
          <Chip tone="good">Vetted local pros</Chip>
          <Chip tone="brand">Daily calorie guide</Chip>
          <Chip tone="accent">Friends nearby</Chip>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg },
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: c.bg },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  field: { gap: 8, marginBottom: 18 },
  label: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.inkSoft },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: r.sm,
    backgroundColor: c.surface,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: c.ink,
  },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: c.bad },
  alert: { padding: 12, marginTop: 4, marginBottom: 12, borderRadius: r.sm, backgroundColor: c.badSoft, color: c.bad, fontFamily: fonts.sansMedium, fontSize: 13.5 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: r.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  optionSmall: { paddingHorizontal: 11, paddingVertical: 5 },
  optionOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  optionText: { fontFamily: fonts.sansSemi, fontSize: 14, color: c.inkSoft },
  segmented: { flexDirection: "row", padding: 4, marginBottom: 18, borderRadius: r.pill, backgroundColor: c.surface2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: r.pill },
  segmentOn: { backgroundColor: c.surface },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 },
  photoEmpty: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: c.lineStrong, backgroundColor: c.surface },
  small: { minWidth: 40, alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: r.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  smallText: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.ink },
  counter: { flexDirection: "row", alignItems: "center", gap: 16 },
  counterValue: { minWidth: 24, textAlign: "center", fontFamily: fonts.headingHeavy, fontSize: 24, color: c.ink },
  callout: { padding: 14, borderRadius: r.sm, backgroundColor: c.surface2 },
  reviewCard: { padding: 14, gap: 6, borderRadius: r.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  reviewValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.sansMedium, fontSize: 13.5, color: c.ink },
  link: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: c.brand },
});
