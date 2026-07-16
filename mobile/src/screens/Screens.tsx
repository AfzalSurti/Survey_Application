import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, login, logout } from "@/api/client";
import { addPhoto, cacheSchema, cachedSchema, dashboardCounts, getPreSurvey, records, savePreSurvey, saveRecord } from "@/db";
import { Button, Field, GlassCard, Header, Label } from "@/components/UI";
import { ServerWakeScreen } from "@/components/ServerWakeScreen";
import { useTheme } from "@/context/ThemeContext";
import {
  COMPANY_INTRO,
  STRUCTURE_CATEGORIES,
  STRUCTURE_SURVEY_DESCRIPTION,
  UTILITY_CATEGORIES,
  UTILITY_SURVEY_DESCRIPTION,
} from "@/content/copy";
import { wakeServer } from "@/lib/wakeServer";
import { FormSchema, Question, QuestionType, SurveyRecord } from "@/types";
import { syncPending } from "@/sync/engine";

export type RootStack = {
  Login: undefined;
  CompanyIntro: undefined;
  SurveyType: undefined;
  StructureBrief: undefined;
  UtilityBrief: undefined;
  PreSurvey: undefined;
  Main: undefined;
  Category: { module: string };
  DynamicForm: { module: string; category: string; categoryLabel?: string };
};
export type Tabs = { Dashboard: undefined; Surveys: undefined; Sync: undefined; Settings: undefined };
type StackProps<N extends keyof RootStack> = NativeStackScreenProps<RootStack, N>;
type TabProps<N extends keyof Tabs> = BottomTabScreenProps<Tabs, N>;

const fallback: FormSchema = {
  version: 1,
  questions: [
    { id: "chainage", label: "Chainage (km)", type: "text", required: true },
    { id: "structure_name", label: "Structure name", type: "text", required: true },
    {
      id: "condition",
      label: "Condition rating",
      type: "condition_rating",
      required: true,
      options: ["Very Good", "Good", "Fair", "Poor", "Very Poor"],
    },
    { id: "photos", label: "Structure photographs", type: "photo_group", required: true, minPhotos: 4 },
  ],
};

function normalizeQuestion(raw: Record<string, unknown>): Question {
  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => (typeof o === "string" ? o : String((o as { label?: string; value?: string }).label ?? (o as { value?: string }).value ?? "")))
    : undefined;
  return {
    id: String(raw.id),
    label: String(raw.label ?? raw.id),
    type: String(raw.type || "text") as QuestionType,
    required: raw.required !== false,
    options: options?.filter(Boolean),
    minPhotos: typeof raw.minPhotos === "number" ? raw.minPhotos : 4,
  };
}

/** Backend stores questions under schema_json.categories[key].questions (+ shared photo group). */
function questionsForCategory(schemaJson: Record<string, unknown> | null | undefined, categoryKey: string): Question[] {
  if (!schemaJson) return [];
  const categories = schemaJson.categories as Record<string, { questions?: Record<string, unknown>[] }> | undefined;
  const fromCat = (categories?.[categoryKey]?.questions ?? []).map(normalizeQuestion);
  const shared = schemaJson.shared as { photo_group?: Record<string, unknown> } | undefined;
  if (shared?.photo_group && !fromCat.some((q) => q.type === "photo_group")) {
    fromCat.push(normalizeQuestion(shared.photo_group));
  }
  if (!fromCat.length) {
    const top = (schemaJson.questions ?? schemaJson.fields) as Record<string, unknown>[] | undefined;
    if (Array.isArray(top)) return top.map(normalizeQuestion);
  }
  return fromCat;
}

function Screen({ children, subtitle }: React.PropsWithChildren<{ subtitle?: string }>) {
  const { theme } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Header subtitle={subtitle} />
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </View>
  );
}

function reasonAlert(title: string, message: string) {
  Alert.alert(title, message);
}

export function LoginScreen({ navigation }: StackProps<"Login">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password.trim()) {
      return reasonAlert("Sign in blocked", "Enter both email and password to continue.");
    }
    try {
      setLoading(true);
      const slow = setTimeout(() => setWaking(true), 800);
      await wakeServer({ onSlow: () => setWaking(true) });
      clearTimeout(slow);
      await login(email.trim(), password);
      setWaking(false);
      navigation.replace("CompanyIntro");
    } catch {
      setWaking(false);
      reasonAlert(
        "Sign in failed",
        "Email or password is incorrect, or the server is still waking up. Wait about a minute and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (waking) {
    return (
      <ServerWakeScreen detail="Waking up server — signing you in can take up to a minute on first load…" />
    );
  }

  return (
    <Screen subtitle="Geo Design and Research Pvt Ltd">
      <GlassCard>
        <Text style={styles.hero}>Field survey, even offline.</Text>
        <Label>Email</Label>
        <Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="surveyor@gdrpl.com" />
        <Label>Password</Label>
        <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <Button title={loading ? "Signing in…" : "Sign in"} onPress={signIn} disabled={loading} disabledReason="Sign in is already in progress." />
      </GlassCard>
    </Screen>
  );
}

export function CompanyIntroScreen({ navigation }: StackProps<"CompanyIntro">) {
  return (
    <Screen subtitle="Geo Design and Research Pvt Ltd Field Survey Application">
      <GlassCard>
        <Text style={styles.hero}>Introduction of Company</Text>
        <Text style={styles.body}>{COMPANY_INTRO}</Text>
        <Button title="Type of Survey" onPress={() => navigation.navigate("SurveyType")} />
        <Button title="Go to Dashboard" onPress={() => navigation.navigate("Main")} />
      </GlassCard>
    </Screen>
  );
}

export function SurveyTypeScreen({ navigation }: StackProps<"SurveyType">) {
  return (
    <Screen>
      <Text style={styles.hero}>Type of Survey</Text>
      <Pressable onPress={() => navigation.navigate("StructureBrief")}>
        <GlassCard style={styles.choice}>
          <Text style={styles.choiceText}>Structure Inventory Survey</Text>
          <Text style={styles.meta}>Highway structures inventory and condition assessment</Text>
        </GlassCard>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("UtilityBrief")}>
        <GlassCard style={styles.choice}>
          <Text style={styles.choiceText}>Utility Survey</Text>
          <Text style={styles.meta}>Existing utilities for shifting assessment</Text>
        </GlassCard>
      </Pressable>
    </Screen>
  );
}

export function StructureBriefScreen({ navigation }: StackProps<"StructureBrief">) {
  const [projects, setProjects] = useState<{ id: string; name: string; project_number: string; highway_number: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [values, setValues] = useState({ headSurveyor: "", organization: "GDRPL" });
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await getPreSurvey();
      if (saved) {
        setValues({ headSurveyor: saved.head_surveyor || "", organization: saved.organization || "GDRPL" });
        if (saved.project_id) setProjectId(saved.project_id);
      }
      try {
        const { data } = await api.get("/api/projects");
        setProjects(data);
        if (!projectId && data[0]) setProjectId(data[0].id);
      } catch {
        reasonAlert("Projects unavailable", "Could not load assigned projects. Connect once so your assignments sync, then try again.");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const selected = projects.find((p) => p.id === projectId);

  const start = async () => {
    if (loadingProjects) {
      return reasonAlert("Please wait", "Assigned projects are still loading.");
    }
    if (!projects.length) {
      return reasonAlert(
        "No assigned project",
        "Super admin has not assigned any project to your account yet. Contact your admin, then pull to refresh after logging in again.",
      );
    }
    if (!projectId || !selected) {
      return reasonAlert("Project required", "Select one assigned project before starting the structure inventory form.");
    }
    if (!values.headSurveyor.trim()) {
      return reasonAlert("Head surveyor required", "Enter the name of the head surveyor to continue.");
    }
    if (!values.organization.trim()) {
      return reasonAlert("Organization required", "Enter the organization name to continue.");
    }
    await savePreSurvey({
      headSurveyor: values.headSurveyor.trim(),
      organization: values.organization.trim(),
      projectId: selected.id,
      projectName: selected.name,
      projectNumber: selected.project_number,
      highwayNumber: selected.highway_number,
    });
    try {
      await api.post("/api/pre-survey", {
        project_id: selected.id,
        head_surveyor_name: values.headSurveyor.trim(),
        organization: values.organization.trim(),
      });
    } catch {
      /* offline ok — saved locally */
    }
    navigation.navigate("Category", { module: "structure_inventory" });
  };

  return (
    <Screen>
      <GlassCard>
        <Text style={styles.hero}>Structure Inventory Survey</Text>
        <Text style={styles.sectionTitle}>Description of the Survey</Text>
        <Text style={styles.body}>{STRUCTURE_SURVEY_DESCRIPTION}</Text>
      </GlassCard>
      <GlassCard>
        <Text style={styles.sectionTitle}>Pre Survey Form (Fill Only One Time)</Text>
        <Text style={styles.meta}>Only projects assigned by super admin appear here.</Text>
        <Label>Project</Label>
        <View style={styles.options}>
          {projects.map((p) => (
            <Pressable key={p.id} onPress={() => setProjectId(p.id)} style={[styles.pill, projectId === p.id && styles.selected]}>
              <Text>
                {p.name} ({p.project_number})
              </Text>
            </Pressable>
          ))}
        </View>
        {!projects.length && !loadingProjects ? <Text style={styles.meta}>No assigned projects yet.</Text> : null}
        <Label>Name of the Head Surveyor</Label>
        <Field value={values.headSurveyor} onChangeText={(v) => setValues((s) => ({ ...s, headSurveyor: v }))} placeholder="Head surveyor name" />
        <Label>Organization</Label>
        <Field value={values.organization} onChangeText={(v) => setValues((s) => ({ ...s, organization: v }))} />
        {selected ? (
          <Text style={styles.meta}>
            Project Name: {selected.name}{"\n"}
            Project Number: {selected.project_number}{"\n"}
            Highway Number: {selected.highway_number}
          </Text>
        ) : null}
        <Button
          title="Submit the Pre-Fill Form and Start Structure Inventory Form"
          onPress={start}
          disabled={loadingProjects}
          disabledReason="Assigned projects are still loading. Wait a moment, then try again."
        />
      </GlassCard>
    </Screen>
  );
}

export function UtilityBriefScreen({ navigation }: StackProps<"UtilityBrief">) {
  return (
    <Screen>
      <GlassCard>
        <Text style={styles.hero}>Utility Survey</Text>
        <Text style={styles.sectionTitle}>Description of the Survey</Text>
        <Text style={styles.body}>{UTILITY_SURVEY_DESCRIPTION}</Text>
        <Button
          title="Start Utility Form"
          onPress={() =>
            navigation.navigate("DynamicForm", {
              module: "utility_shifting",
              category: "utility_identification",
              categoryLabel: "Utility Identification",
            })
          }
        />
      </GlassCard>
    </Screen>
  );
}

/** Kept for deep links / older navigation; redirects into structure brief. */
export function PreSurveyScreen({ navigation }: StackProps<"PreSurvey">) {
  useEffect(() => {
    navigation.replace("StructureBrief");
  }, [navigation]);
  return null;
}

export function CategoryScreen({ navigation, route }: StackProps<"Category">) {
  const { module } = route.params;
  const list = module === "utility_shifting" ? UTILITY_CATEGORIES : STRUCTURE_CATEGORIES;
  return (
    <Screen>
      <Text style={styles.hero}>Select structure type</Text>
      <Text style={styles.meta}>Choose the structure that matches the field asset.</Text>
      {list.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => navigation.navigate("DynamicForm", { module, category: item.key, categoryLabel: item.label })}
        >
          <GlassCard style={styles.category}>
            <Text style={styles.choiceText}>{item.label}</Text>
          </GlassCard>
        </Pressable>
      ))}
    </Screen>
  );
}

export function DynamicFormScreen({ route, navigation }: StackProps<"DynamicForm">) {
  const { module, category, categoryLabel } = route.params;
  const [schema, setSchema] = useState<FormSchema>(fallback);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState("Locating…");
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setLoadError("");
      try {
        const { data } = await api.get(`/api/schemas/${module}/active`);
        const schemaJson = data.schema_json as Record<string, unknown>;
        await cacheSchema(module, data.version, schemaJson);
        const questions = questionsForCategory(schemaJson, category);
        if (cancelled) return;
        if (!questions.length) {
          setLoadState("error");
          setLoadError(
            `No questions found for category "${category}". The form stayed on this screen — it did not auto-submit. Ask super admin to publish the schema, or pick another structure type.`,
          );
          return;
        }
        setSchema({ version: data.version, questions });
        setLoadState("ready");
      } catch {
        const cached = await cachedSchema(module);
        if (cancelled) return;
        if (cached) {
          try {
            const schemaJson = JSON.parse(cached.schema_json) as Record<string, unknown>;
            const questions = questionsForCategory(schemaJson, category);
            if (questions.length) {
              setSchema({ version: cached.version, questions });
              setLoadState("ready");
            } else {
              setLoadState("error");
              setLoadError("Cached schema has no questions for this category. Connect online once to refresh the questionnaire.");
            }
          } catch {
            setLoadState("error");
            setLoadError("Could not parse cached questionnaire. Connect online to download the latest form.");
          }
        } else {
          setLoadState("error");
          setLoadError("Could not download the questionnaire and no offline cache exists. Connect to the internet once, then reopen this form.");
        }
      }
    })();

    (async () => {
      try {
        const locationPermission = await Location.requestForegroundPermissionsAsync();
        if (locationPermission.status !== "granted") {
          if (!cancelled) setGpsStatus("GPS permission denied — you can still fill answers and submit.");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setCoords(pos.coords);
          setGpsStatus(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
      } catch {
        if (!cancelled) setGpsStatus("GPS unavailable — you can still fill answers and submit.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [module, category]);

  const setAnswer = (id: string, value: unknown) => setAnswers((v) => ({ ...v, [id]: value }));

  const capture = async (camera: CameraView | null) => {
    const photo = await camera?.takePictureAsync({ quality: 0.7 });
    if (photo?.uri) {
      setPhotos((p) => [...p, photo.uri]);
      setCameraOpen(false);
    }
  };

  const submit = async () => {
    if (loadState !== "ready") {
      return reasonAlert("Form not ready", loadError || "Wait until questions finish loading before submitting.");
    }
    const missing = schema.questions.filter((q) => q.required && q.type !== "photo_group" && (answers[q.id] === undefined || answers[q.id] === ""));
    if (missing.length) {
      return reasonAlert(
        "Incomplete form",
        `Fill required fields before submit:\n• ${missing
          .slice(0, 6)
          .map((q) => q.label)
          .join("\n• ")}${missing.length > 6 ? `\n• …and ${missing.length - 6} more` : ""}`,
      );
    }
    const photoQ = schema.questions.find((q) => q.type === "photo_group");
    const minimum = photoQ?.minPhotos ?? 4;
    if (photoQ && photos.length < minimum) {
      return reasonAlert("More photos required", `Capture at least ${minimum} photos before submit. You currently have ${photos.length}.`);
    }
    const record: SurveyRecord = {
      id: crypto.randomUUID(),
      module,
      category,
      chainage: String(answers.chainage ?? ""),
      responses: {
        ...answers,
        structure_category: category,
        gps: coords ? { latitude: coords.latitude, longitude: coords.longitude } : null,
        capturedAt: new Date().toISOString(),
      },
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      capturedAt: new Date().toISOString(),
      status: "submitted",
      syncStatus: "pending",
      schemaVersion: schema.version,
    };
    await saveRecord(record);
    for (const uri of photos) await addPhoto(record.id, uri);
    Alert.alert("Saved locally", "The completed record is ready to sync.", [
      { text: "Done", onPress: () => navigation.navigate("Main") },
    ]);
  };

  const renderQuestion = (q: Question) => {
    if (q.type === "photo_group") {
      return (
        <View key={q.id} style={styles.qBlock}>
          <Label>
            {q.label} ({photos.length}/{q.minPhotos ?? 4})
          </Label>
          <Button
            title="Open camera"
            onPress={async () => {
              if (!permission?.granted) {
                const res = await requestPermission();
                if (!res.granted) {
                  return reasonAlert("Camera blocked", "Camera permission is required to capture structure photographs. Enable it in system settings.");
                }
              }
              setCameraOpen(true);
            }}
          />
        </View>
      );
    }
    if (q.type === "select" || q.type === "condition_rating") {
      return (
        <View key={q.id} style={styles.qBlock}>
          <Label>
            {q.label}
            {q.required ? " *" : ""}
          </Label>
          <View style={styles.options}>
            {(q.options ?? []).map((option) => (
              <Pressable key={option} onPress={() => setAnswer(q.id, option)} style={[styles.pill, answers[q.id] === option && styles.selected]}>
                <Text>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }
    if (q.type === "multiselect") {
      return (
        <View key={q.id} style={styles.qBlock}>
          <Label>
            {q.label}
            {q.required ? " *" : ""}
          </Label>
          <View style={styles.options}>
            {(q.options ?? []).map((option) => {
              const selected = ((answers[q.id] as string[]) ?? []).includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() =>
                    setAnswer(
                      q.id,
                      selected ? (answers[q.id] as string[]).filter((x) => x !== option) : [...((answers[q.id] as string[]) ?? []), option],
                    )
                  }
                  style={[styles.pill, selected && styles.selected]}
                >
                  <Text>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    if (q.type === "date") {
      return (
        <View key={q.id} style={styles.qBlock}>
          <Label>{q.label}</Label>
          <Field editable={false} value={new Date().toLocaleString()} />
        </View>
      );
    }
    return (
      <View key={q.id} style={styles.qBlock}>
        <Label>
          {q.label}
          {q.required ? " *" : ""}
        </Label>
        <Field
          value={String(answers[q.id] ?? "")}
          onChangeText={(v) => setAnswer(q.id, v)}
          keyboardType={q.type === "number" ? "numeric" : "default"}
          placeholder={q.id === "chainage" ? "e.g. 218+450" : undefined}
        />
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.formRow}>
        <View style={styles.rail}>
          <View
            style={[
              styles.railFill,
              {
                height: `${Math.min(
                  100,
                  (Object.keys(answers).length / Math.max(schema.questions.filter((q) => q.type !== "photo_group").length, 1)) * 100,
                )}%`,
              },
            ]}
          />
        </View>
        <GlassCard style={styles.form}>
          <Text style={styles.hero}>{categoryLabel || category}</Text>
          <Text style={styles.meta}>
            GPS: {gpsStatus}
            {"\n"}Captured: {new Date().toLocaleString()}
            {"\n"}Location is captured in the background — this screen stays open until you submit.
          </Text>
          {loadState === "loading" ? <Text style={styles.meta}>Loading questionnaire for this structure type…</Text> : null}
          {loadState === "error" ? <Text style={styles.error}>{loadError}</Text> : null}
          {loadState === "ready" ? schema.questions.map(renderQuestion) : null}
          <Button
            title="Submit survey"
            onPress={submit}
            disabled={loadState !== "ready"}
            disabledReason={loadError || "Wait until the questionnaire finishes loading. GPS does not submit the form for you."}
          />
        </GlassCard>
      </View>
      <Modal visible={cameraOpen} animationType="slide">
        <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef}>
          <View style={styles.camera}>
            <Button title="Capture photo" onPress={() => capture(cameraRef.current)} />
            <Button title="Cancel" onPress={() => setCameraOpen(false)} />
          </View>
        </CameraView>
      </Modal>
    </Screen>
  );
}

export function DashboardScreen({ navigation }: TabProps<"Dashboard">) {
  const [counts, setCounts] = useState<{ total: number; pending: number; completed: number; photos: number }>();
  const load = useCallback(() => {
    dashboardCounts().then((value) => {
      if (value) setCounts(value);
    });
  }, []);
  useEffect(load, [load]);
  return (
    <Screen>
      <Text style={styles.hero}>Today’s overview</Text>
      <View style={styles.grid}>
        {[
          ["Total Structures", counts?.total ?? 0],
          ["Pending Sync", counts?.pending ?? 0],
          ["Completed", counts?.completed ?? 0],
          ["Total Photos", counts?.photos ?? 0],
        ].map(([label, value]) => (
          <GlassCard key={label as string} style={styles.metric}>
            <Text style={styles.number}>{value}</Text>
            <Text>{label}</Text>
          </GlassCard>
        ))}
      </View>
      <Button title="Start new survey" onPress={() => navigation.getParent()?.navigate("CompanyIntro")} />
    </Screen>
  );
}

export function SurveyListScreen(_: TabProps<"Surveys">) {
  const [list, setList] = useState<(SurveyRecord & { responses_json: string })[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    records().then(setList);
  }, []);
  return (
    <Screen>
      <Field placeholder="Search category or chainage" value={search} onChangeText={setSearch} />
      <FlatList
        scrollEnabled={false}
        data={list.filter((r) => `${r.category} ${r.chainage}`.toLowerCase().includes(search.toLowerCase()))}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <GlassCard style={styles.item}>
            <Text style={styles.choiceText}>{item.category}</Text>
            <Text>
              Chainage {item.chainage || "—"} · {item.status}
            </Text>
            <Text style={styles.meta}>{item.syncStatus}</Text>
          </GlassCard>
        )}
      />
    </Screen>
  );
}

export function SyncScreen(_: TabProps<"Sync">) {
  const [message, setMessage] = useState("Ready to sync.");
  const run = async () => {
    setMessage("Syncing…");
    const result = await syncPending();
    setMessage(result.error ?? `${result.synced} record(s) synced.`);
    if (result.error) reasonAlert("Sync failed", result.error);
  };
  return (
    <Screen>
      <GlassCard>
        <Text style={styles.hero}>Sync center</Text>
        <Text style={styles.meta}>{message}</Text>
        <Button title="Sync Now" onPress={run} />
      </GlassCard>
    </Screen>
  );
}

export function SettingsScreen({ navigation }: TabProps<"Settings">) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <Screen>
      <GlassCard>
        <Text style={styles.hero}>Settings</Text>
        <View style={styles.setting}>
          <Text>Dark mode</Text>
          <Switch value={isDark} onValueChange={toggleTheme} />
        </View>
        <Text style={styles.meta}>Connected to GDRPL Survey cloud API.</Text>
        <Button title="About GDRPL" onPress={() => navigation.getParent()?.navigate("CompanyIntro")} />
        <Button
          title="Log out"
          onPress={async () => {
            await logout();
            navigation.getParent()?.navigate("Login");
          }}
        />
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  hero: { fontSize: 22, fontWeight: "800", color: "#1B3A5C", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#1B3A5C", marginBottom: 8 },
  body: { color: "#3D5570", lineHeight: 22, marginBottom: 14, fontSize: 14 },
  choice: { marginBottom: 12, minHeight: 92, justifyContent: "center" },
  choiceText: { color: "#1B3A5C", fontWeight: "800", fontSize: 17 },
  category: { paddingVertical: 18, marginBottom: 8 },
  meta: { color: "#55708C", lineHeight: 21, marginBottom: 12 },
  error: { color: "#9a4646", lineHeight: 21, marginBottom: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { width: "47%", minHeight: 125, justifyContent: "center" },
  number: { fontSize: 34, fontWeight: "800", color: "#1B4F8C" },
  formRow: { flexDirection: "row", gap: 10 },
  rail: { width: 6, backgroundColor: "rgba(111,168,62,.18)", borderRadius: 4, overflow: "hidden" },
  railFill: { width: "100%", backgroundColor: "#6FA83E" },
  form: { flex: 1 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  pill: { borderWidth: 1, borderColor: "#B8CCE1", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  selected: { backgroundColor: "#CFE5BA", borderColor: "#6FA83E" },
  camera: { marginTop: "auto", padding: 24, gap: 12 },
  item: { marginBottom: 10 },
  setting: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  qBlock: { marginBottom: 4 },
});
