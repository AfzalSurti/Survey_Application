import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { CommonActions } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, login, logout } from "@/api/client";
import { addPhoto, cacheSchema, cachedSchema, dashboardCounts, getPreSurvey, records, savePreSurvey, saveRecord } from "@/db";
import {
  Body,
  Button,
  ChoicePill,
  EmptyState,
  Field,
  GlassCard,
  Hero,
  Label,
  Meta,
  Screen,
  SectionTitle,
  StatusChip,
} from "@/components/UI";
import { PhotoCaptureSession } from "@/components/PhotoCaptureSession";
import { ServerWakeScreen } from "@/components/ServerWakeScreen";
import { useTheme } from "@/context/ThemeContext";
import {
  COMPANY_INTRO,
  STRUCTURE_CATEGORIES,
  STRUCTURE_SURVEY_DESCRIPTION,
  UTILITY_CATEGORIES,
  UTILITY_SURVEY_DESCRIPTION,
} from "@/content/copy";
import { newId } from "@/lib/id";
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
    return <ServerWakeScreen detail="Waking up server — signing you in can take up to a minute on first load…" />;
  }

  return (
    <Screen subtitle="Geo Design and Research Pvt Ltd" keyboard>
      <GlassCard>
        <Hero>Field survey, even offline.</Hero>
        <Meta>Sign in with your GDRPL field account to capture structure and utility surveys.</Meta>
        <Label>Email</Label>
        <Field
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="surveyor@gdrpl.com"
          returnKeyType="next"
        />
        <Label>Password</Label>
        <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" returnKeyType="go" onSubmitEditing={signIn} />
        <Button title={loading ? "Signing in…" : "Sign in"} onPress={signIn} disabled={loading} loading={loading} disabledReason="Sign in is already in progress." />
      </GlassCard>
    </Screen>
  );
}

export function CompanyIntroScreen({ navigation }: StackProps<"CompanyIntro">) {
  return (
    <Screen subtitle="Field Survey Application" onBack={() => navigation.navigate("Main")}>
      <GlassCard>
        <Hero>About GDRPL</Hero>
        <Body>{COMPANY_INTRO}</Body>
        <Button title="Type of Survey" onPress={() => navigation.navigate("SurveyType")} />
        <Button title="Go to Dashboard" variant="secondary" onPress={() => navigation.navigate("Main")} />
      </GlassCard>
    </Screen>
  );
}

export function SurveyTypeScreen({ navigation }: StackProps<"SurveyType">) {
  const { theme } = useTheme();
  return (
    <Screen onBack={() => navigation.goBack()}>
      <Hero>Type of Survey</Hero>
      <Meta>Choose the survey module that matches today’s field work.</Meta>
      <Pressable onPress={() => navigation.navigate("StructureBrief")}>
        <GlassCard style={styles.choice}>
          <View style={[styles.choiceBadge, { backgroundColor: theme.successSoft }]}>
            <Text style={{ color: theme.accentSecondary, fontWeight: "800" }}>01</Text>
          </View>
          <Text style={[styles.choiceText, { color: theme.ink }]}>Structure Inventory Survey</Text>
          <Meta>Highway structures inventory and condition assessment</Meta>
        </GlassCard>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("UtilityBrief")}>
        <GlassCard style={styles.choice}>
          <View style={[styles.choiceBadge, { backgroundColor: "rgba(27,79,140,0.12)" }]}>
            <Text style={{ color: theme.accentPrimary, fontWeight: "800" }}>02</Text>
          </View>
          <Text style={[styles.choiceText, { color: theme.ink }]}>Utility Survey</Text>
          <Meta>Existing utilities for shifting assessment</Meta>
        </GlassCard>
      </Pressable>
    </Screen>
  );
}

export function StructureBriefScreen({ navigation }: StackProps<"StructureBrief">) {
  const { theme } = useTheme();
  const [projects, setProjects] = useState<{ id: string; name: string; project_number: string; highway_number: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [values, setValues] = useState({ headSurveyor: "", organization: "GDRPL" });
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showFullDescription, setShowFullDescription] = useState(false);

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
    if (loadingProjects) return reasonAlert("Please wait", "Assigned projects are still loading.");
    if (!projects.length) {
      return reasonAlert(
        "No assigned project",
        "Super admin has not assigned any project to your account yet. Contact your admin, then try again.",
      );
    }
    if (!projectId || !selected) return reasonAlert("Project required", "Select one assigned project before starting the form.");
    if (!values.headSurveyor.trim()) return reasonAlert("Head surveyor required", "Enter the name of the head surveyor to continue.");
    if (!values.organization.trim()) return reasonAlert("Organization required", "Enter the organization name to continue.");
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
    <Screen onBack={() => navigation.goBack()} keyboard>
      <GlassCard>
        <Hero>Structure Inventory</Hero>
        <SectionTitle>Description</SectionTitle>
        <Body>
          {showFullDescription
            ? STRUCTURE_SURVEY_DESCRIPTION
            : `${STRUCTURE_SURVEY_DESCRIPTION.slice(0, 180).trim()}…`}
        </Body>
        <Button
          title={showFullDescription ? "Hide full description" : "Read full description"}
          variant="ghost"
          onPress={() => setShowFullDescription((v) => !v)}
        />
      </GlassCard>
      <GlassCard>
        <SectionTitle>Pre-survey (once per session)</SectionTitle>
        <Meta>Only projects assigned by super admin appear here.</Meta>
        <Label>Project</Label>
        {loadingProjects ? <ActivityIndicator color={theme.accentPrimary} style={{ marginVertical: 12 }} /> : null}
        <View style={styles.options}>
          {projects.map((p) => (
            <ChoicePill key={p.id} label={`${p.name} (${p.project_number})`} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
          ))}
        </View>
        {!projects.length && !loadingProjects ? (
          <EmptyState title="No projects assigned" message="Ask your super admin to assign a project to this field account." />
        ) : null}
        <Label>Name of the Head Surveyor</Label>
        <Field value={values.headSurveyor} onChangeText={(v) => setValues((s) => ({ ...s, headSurveyor: v }))} placeholder="Head surveyor name" />
        <Label>Organization</Label>
        <Field value={values.organization} onChangeText={(v) => setValues((s) => ({ ...s, organization: v }))} />
        {selected ? (
          <View style={[styles.infoBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Meta>
              Project: {selected.name}{"\n"}
              Number: {selected.project_number}{"\n"}
              Highway: {selected.highway_number}
            </Meta>
          </View>
        ) : null}
        <Button
          title="Continue to structure types"
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
    <Screen onBack={() => navigation.goBack()}>
      <GlassCard>
        <Hero>Utility Survey</Hero>
        <SectionTitle>Description</SectionTitle>
        <Body>{UTILITY_SURVEY_DESCRIPTION}</Body>
        <Button
          title="Start utility form"
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
  return <ServerWakeScreen detail="Opening pre-survey…" />;
}

export function CategoryScreen({ navigation, route }: StackProps<"Category">) {
  const { theme } = useTheme();
  const { module } = route.params;
  const list = module === "utility_shifting" ? UTILITY_CATEGORIES : STRUCTURE_CATEGORIES;
  return (
    <Screen onBack={() => navigation.goBack()}>
      <Hero>Select structure type</Hero>
      <Meta>Choose the structure that matches the field asset.</Meta>
      {list.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={() => navigation.navigate("DynamicForm", { module, category: item.key, categoryLabel: item.label })}
        >
          <GlassCard style={styles.category}>
            <View style={styles.categoryRow}>
              <View style={[styles.choiceBadge, { backgroundColor: theme.successSoft }]}>
                <Text style={{ color: theme.accentSecondary, fontWeight: "800" }}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceText, { color: theme.ink }]}>{item.label}</Text>
                <Text style={{ color: theme.accentPrimary, fontWeight: "800", marginTop: 8, fontSize: 15 }}>Open form →</Text>
              </View>
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </Screen>
  );
}

export function DynamicFormScreen({ route, navigation }: StackProps<"DynamicForm">) {
  const { theme } = useTheme();
  const { module, category, categoryLabel } = route.params;
  const [schema, setSchema] = useState<FormSchema>(fallback);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoSessionOpen, setPhotoSessionOpen] = useState(false);
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState("Locating…");

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
            `No questions found for category "${category}". Ask super admin to publish the schema, or pick another structure type.`,
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
              setLoadError("Cached schema has no questions for this category. Connect online once to refresh.");
            }
          } catch {
            setLoadState("error");
            setLoadError("Could not parse cached questionnaire. Connect online to download the latest form.");
          }
        } else {
          setLoadState("error");
          setLoadError("Could not download the questionnaire and no offline cache exists. Connect once, then reopen.");
        }
      }
    })();

    (async () => {
      try {
        const locationPermission = await Location.requestForegroundPermissionsAsync();
        if (locationPermission.status !== "granted") {
          if (!cancelled) setGpsStatus("GPS permission denied — you can still fill and submit.");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setCoords(pos.coords);
          setGpsStatus(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
      } catch {
        if (!cancelled) setGpsStatus("GPS unavailable — you can still fill and submit.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [module, category]);

  const setAnswer = (id: string, value: unknown) => setAnswers((v) => ({ ...v, [id]: value }));

  const answerCount = Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== "").length;
  const answerTotal = Math.max(schema.questions.filter((q) => q.type !== "photo_group").length, 1);
  const progressPct = Math.min(100, Math.round((answerCount / answerTotal) * 100));

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
      id: newId(),
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
      const min = q.minPhotos ?? 4;
      return (
        <View key={q.id} style={styles.qBlock}>
          <Label>
            {q.label} ({photos.length}/{min})
          </Label>
          <Meta>Opens a photo session — pick a camera app or gallery. Stays open until {min} photos are captured.</Meta>
          <View style={styles.photoRow}>
            {photos.map((uri) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <Pressable
                  style={styles.thumbRemove}
                  onPress={() => setPhotos((list) => list.filter((p) => p !== uri))}
                >
                  <Text style={styles.thumbRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Button title="Add photos" variant="secondary" onPress={() => setPhotoSessionOpen(true)} />
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
              <ChoicePill key={option} label={option} selected={answers[q.id] === option} onPress={() => setAnswer(q.id, option)} />
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
                <ChoicePill
                  key={option}
                  label={option}
                  selected={selected}
                  onPress={() =>
                    setAnswer(
                      q.id,
                      selected ? (answers[q.id] as string[]).filter((x) => x !== option) : [...((answers[q.id] as string[]) ?? []), option],
                    )
                  }
                />
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
    <Screen onBack={() => navigation.goBack()} keyboard>
      <View style={[styles.progressTrack, { backgroundColor: "rgba(111,168,62,.18)" }]}>
        <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: theme.accentSecondary }]} />
      </View>
      <Meta>{progressPct}% complete · GPS: {gpsStatus}</Meta>
      <GlassCard>
        <Hero>{categoryLabel || category}</Hero>
        <Meta>Captured: {new Date().toLocaleString()}</Meta>
        {loadState === "loading" ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accentPrimary} />
            <Meta>Loading questionnaire…</Meta>
          </View>
        ) : null}
        {loadState === "error" ? <Text style={[styles.error, { color: theme.danger }]}>{loadError}</Text> : null}
        {loadState === "ready" ? schema.questions.map(renderQuestion) : null}
        <Button
          title="Submit survey"
          onPress={submit}
          disabled={loadState !== "ready"}
          disabledReason={loadError || "Wait until the questionnaire finishes loading."}
        />
      </GlassCard>
      <PhotoCaptureSession
        visible={photoSessionOpen}
        minPhotos={schema.questions.find((q) => q.type === "photo_group")?.minPhotos ?? 4}
        photos={photos}
        onChange={setPhotos}
        onClose={() => setPhotoSessionOpen(false)}
      />
    </Screen>
  );
}

export function DashboardScreen({ navigation }: TabProps<"Dashboard">) {
  const { theme } = useTheme();
  const [counts, setCounts] = useState<{ total: number; pending: number; completed: number; photos: number }>();
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const value = await dashboardCounts();
    if (value) setCounts(value);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(
    () => [
      ["Total Structures", counts?.total ?? 0, theme.accentPrimary],
      ["Pending Sync", counts?.pending ?? 0, theme.warn],
      ["Completed", counts?.completed ?? 0, theme.accentSecondary],
      ["Total Photos", counts?.photos ?? 0, theme.ink],
    ] as const,
    [counts, theme],
  );

  return (
    <Screen
      scroll
      right={
        <Pressable onPress={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }}>
          <Text style={{ color: theme.accentPrimary, fontWeight: "700" }}>{refreshing ? "…" : "Refresh"}</Text>
        </Pressable>
      }
    >
      <Hero>Today’s overview</Hero>
      <Meta>Local field totals stored on this device.</Meta>
      <View style={styles.grid}>
        {metrics.map(([label, value, color]) => (
          <GlassCard key={label} style={styles.metric}>
            <Text style={[styles.number, { color }]}>{value}</Text>
            <Text style={{ color: theme.muted, fontWeight: "700", fontSize: 13 }}>{label}</Text>
          </GlassCard>
        ))}
      </View>
      {!counts?.total ? (
        <EmptyState
          title="No surveys yet"
          message="Add a new structure survey, or submit the entire project when field work is finished."
        />
      ) : null}
      <Button
        title="New Structure"
        onPress={async () => {
          const saved = await getPreSurvey();
          if (saved?.project_id) {
            navigation.getParent()?.navigate("Category", { module: "structure_inventory" });
          } else {
            navigation.getParent()?.navigate("StructureBrief");
          }
        }}
      />
      <Button
        title="Submit Entire Project Survey"
        variant="secondary"
        onPress={() => {
          Alert.alert(
            "Submit entire project?",
            "This ends the current field session and returns you to sign-in after you confirm. Sync pending records from the Sync tab first if needed.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Go to Sign in",
                onPress: async () => {
                  await logout();
                  navigation.getParent()?.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: "Login" }],
                    }),
                  );
                },
              },
            ],
          );
        }}
      />
      <Button
        title="Other survey types"
        variant="ghost"
        onPress={() => navigation.getParent()?.navigate("CompanyIntro")}
      />
    </Screen>
  );
}

export function SurveyListScreen(_: TabProps<"Surveys">) {
  const { theme } = useTheme();
  const [list, setList] = useState<(SurveyRecord & { responses_json: string })[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setList(await records());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = list.filter((r) => `${r.category} ${r.chainage}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Screen scroll={false}>
      <Hero>Surveys</Hero>
      <Field placeholder="Search category or chainage" value={search} onChangeText={setSearch} />
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={theme.accentPrimary}
          />
        }
        ListEmptyComponent={
          <EmptyState title="No records yet" message="Completed surveys will appear here for review and sync." />
        }
        renderItem={({ item }) => (
          <GlassCard style={styles.item}>
            <Text style={[styles.choiceText, { color: theme.ink }]}>{item.category.replace(/_/g, " ")}</Text>
            <Text style={{ color: theme.cardText, marginTop: 4 }}>
              Chainage {item.chainage || "—"} · {item.status}
            </Text>
            <View style={{ marginTop: 8 }}>
              <StatusChip status={item.syncStatus} />
            </View>
          </GlassCard>
        )}
      />
    </Screen>
  );
}

export function SyncScreen(_: TabProps<"Sync">) {
  const { theme } = useTheme();
  const [message, setMessage] = useState("Ready to sync pending records to the cloud.");
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const counts = await dashboardCounts();
    setPending(counts?.pending ?? 0);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async () => {
    setBusy(true);
    setMessage("Syncing…");
    const result = await syncPending();
    setMessage(result.error ?? `${result.synced} record(s) synced successfully.`);
    await refresh();
    setBusy(false);
    if (result.error) reasonAlert("Sync failed", result.error);
  };

  return (
    <Screen>
      <GlassCard>
        <Hero>Sync center</Hero>
        <View style={[styles.syncStat, { backgroundColor: theme.successSoft, borderColor: theme.border }]}>
          <Text style={[styles.number, { color: theme.accentSecondary, fontSize: 28 }]}>{pending}</Text>
          <Text style={{ color: theme.ink, fontWeight: "700" }}>Pending records</Text>
        </View>
        <Meta>{message}</Meta>
        <Button title={busy ? "Syncing…" : "Sync now"} onPress={run} loading={busy} disabled={busy} disabledReason="Sync is already running." />
      </GlassCard>
    </Screen>
  );
}

export function SettingsScreen({ navigation }: TabProps<"Settings">) {
  const { theme, isDark, toggleTheme } = useTheme();
  return (
    <Screen>
      <GlassCard>
        <Hero>Settings</Hero>
        <View style={styles.setting}>
          <View>
            <Text style={{ color: theme.ink, fontWeight: "700" }}>Dark mode</Text>
            <Meta>Easier on the eyes in the field at night.</Meta>
          </View>
          <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: theme.accentSecondary }} />
        </View>
        <Meta>Connected to GDRPL Survey cloud API on Render.</Meta>
        <Button title="About GDRPL" variant="secondary" onPress={() => navigation.getParent()?.navigate("CompanyIntro")} />
        <Button
          title="Log out"
          variant="danger"
          onPress={async () => {
            await logout();
            navigation.getParent()?.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: "Login" }],
              }),
            );
          }}
        />
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: { marginBottom: 4, minHeight: 108, justifyContent: "center" },
  choiceBadge: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  choiceText: { fontWeight: "800", fontSize: 17, textTransform: "capitalize" },
  category: { paddingVertical: 18, marginBottom: 2 },
  categoryRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  error: { lineHeight: 21, marginBottom: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { width: "47%", minHeight: 118, justifyContent: "center" },
  number: { fontSize: 34, fontWeight: "800", marginBottom: 4 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  camera: { marginTop: "auto", padding: 24, gap: 10 },
  item: { marginBottom: 2 },
  setting: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12 },
  qBlock: { marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  loadingBox: { alignItems: "center", paddingVertical: 18, gap: 8 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  thumbWrap: { width: 72, height: 72, borderRadius: 12, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveText: { color: "#fff", fontWeight: "800", fontSize: 14, marginTop: -1 },
  infoBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  syncStat: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, alignItems: "flex-start" },
});
