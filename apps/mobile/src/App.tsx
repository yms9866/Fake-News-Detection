import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { toAnalysisDisplayModel } from "@fnd/analysis-view-model";
import { MobileApiClient, MobileApiError } from "./api/client";
import { normalizeApiUrl, resolveApiUrl } from "./config/api";

export const MOBILE_SCREENS = [
  "TextAnalysis",
  "UrlAnalysis",
  "CameraImage",
  "GalleryImage",
  "MicrophoneRecording",
  "AudioSelection",
  "VideoRecording",
  "VideoSelection",
  "ScreenshotAnalysis",
  "ShareIntent",
  "ShareExtension",
  "UploadProgress",
  "ResultEvidence",
  "History",
  "SecureSettings",
  "Auth",
  "DeepLinks",
  "OfflineQueue"
];

const DEFAULT_API_URL = resolveApiUrl({ platform: Platform.OS });

export function createMobileAppShell() {
  return {
    screens: [...MOBILE_SCREENS],
    localFirst: true,
    noOfflineVerificationPromise: true,
    providerSecretsInBundle: false
  };
}

function cleanOrigin(origin: string) {
  try {
    return normalizeApiUrl(origin || DEFAULT_API_URL);
  } catch {
    return DEFAULT_API_URL;
  }
}

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function Button({
  label,
  onPress,
  secondary = false,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled ? styles.disabledButton : null,
        pressed && !disabled ? styles.pressedButton : null
      ]}
    >
      <Text style={[styles.buttonText, secondary ? styles.secondaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

function ResultPanel({ result }: { result: Record<string, unknown> | null }) {
  const display = toAnalysisDisplayModel(result);
  if (!display) {
    return null;
  }
  const claims = Array.isArray(display.claims) ? display.claims.slice(0, 3) : [];
  const sources = Array.isArray(display.sources) ? display.sources.slice(0, 3) : [];
  return (
    <View style={styles.panel}>
      <View style={styles.resultHeader}>
        <Text style={styles.panelTitle}>Result</Text>
        <Text style={[styles.verdict, verdictTone(display.finalVerdict)]}>{valueOrDash(display.finalVerdict)}</Text>
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Confidence</Text>
        <Text style={styles.metricValue}>{valueOrDash(display.confidence)}</Text>
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Style signal</Text>
        <Text style={styles.metricValue}>{valueOrDash(display.styleSignal)}</Text>
      </View>
      <Text style={styles.meta}>{display.styleLimitation}</Text>
      <Text style={styles.reason}>{valueOrDash(display.reason)}</Text>
      {claims.map((claim, index) => (
        <Text key={index} style={styles.evidenceItem}>
          {`${index + 1}. ${valueOrDash((claim as { verification_status?: string }).verification_status)} - ${valueOrDash((claim as { claim_text?: string }).claim_text)}`}
        </Text>
      ))}
      {sources.map((item, index) => (
        <Text key={index} style={styles.evidenceItem}>
          {`${index + 1}. ${valueOrDash((item as { title?: string; url?: string }).title || (item as { url?: string }).url)}`}
        </Text>
      ))}
      {display.warnings.map((warning, index) => (
        <Text key={`${warning}-${index}`} style={styles.warningItem}>{warning}</Text>
      ))}
    </View>
  );
}

function verdictTone(verdict: string) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "REAL") return styles.realTone;
  if (normalized === "FAKE") return styles.fakeTone;
  if (normalized === "UNVERIFIED") return styles.unverifiedTone;
  return styles.neutralTone;
}

export default function App() {
  const [backendOrigin, setBackendOrigin] = useState(DEFAULT_API_URL);
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [deepCheck, setDeepCheck] = useState(true);
  const [maxLength, setMaxLength] = useState("512");
  const [backendStatus, setBackendStatus] = useState("Not checked");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  const activeInput = mode === "text" ? text : url;
  const origin = useMemo(() => cleanOrigin(backendOrigin), [backendOrigin]);

  async function checkBackend() {
    setBackendStatus("Checking");
    setError("");
    try {
      const client = new MobileApiClient({ apiUrl: origin });
      const payload = await client.getHealth();
      setBackendStatus(payload && payload.status ? payload.status : "Live");
    } catch (caught) {
      setBackendStatus(caught instanceof MobileApiError || caught instanceof Error ? caught.message : "Backend unavailable");
    }
  }

  async function runAnalysis() {
    const trimmed = String(activeInput || "").trim();
    if (!trimmed) {
      setError(mode === "text" ? "Text is required." : "URL is required.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const client = new MobileApiClient({ apiUrl: origin });
      const payload = mode === "text"
        ? await client.analyzeText({ text: trimmed, deep_check: deepCheck, max_length: Number(maxLength) || 512 })
        : await client.analyzeUrl({ url: trimmed, deep_check: deepCheck, max_length: Number(maxLength) || 512 });
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backend request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>FAKE NEWS PLATFORM</Text>
          <Text style={styles.title}>Mobile Analysis</Text>
          <Text style={styles.status}>{`Backend: ${backendStatus}`}</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.label}>Backend URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            onChangeText={setBackendOrigin}
            style={styles.input}
            value={backendOrigin}
          />
          <Button label="Check Backend" onPress={() => void checkBackend()} secondary />
        </View>
        <View style={styles.segment}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode("text")}
            style={[styles.segmentItem, mode === "text" ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, mode === "text" ? styles.segmentTextActive : null]}>Text</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode("url")}
            style={[styles.segmentItem, mode === "url" ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, mode === "url" ? styles.segmentTextActive : null]}>URL</Text>
          </Pressable>
        </View>
        <View style={styles.panel}>
          <Text style={styles.label}>{mode === "text" ? "Claim Text" : "Article URL"}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            inputMode={mode === "text" ? "text" : "url"}
            multiline={mode === "text"}
            onChangeText={mode === "text" ? setText : setUrl}
            placeholder={mode === "text" ? "Paste a claim" : "https://example.com/article"}
            placeholderTextColor="#7a8178"
            style={[styles.input, mode === "text" ? styles.textArea : null]}
            value={mode === "text" ? text : url}
          />
          <View style={styles.optionsRow}>
            <View style={styles.switchRow}>
              <Text style={styles.optionText}>Deep check</Text>
              <Switch value={deepCheck} onValueChange={setDeepCheck} />
            </View>
            <View style={styles.maxLengthGroup}>
              <Text style={styles.optionText}>Max</Text>
              <TextInput
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setMaxLength}
                style={styles.maxLengthInput}
                value={maxLength}
              />
            </View>
          </View>
          <Button label={loading ? "Analyzing" : "Analyze"} onPress={() => void runAnalysis()} disabled={loading} />
        </View>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#087f8c" />
            <Text style={styles.loadingText}>Analyzing</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <ResultPanel result={result} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f6f8f5" },
  container: { padding: 20, gap: 14 },
  header: { paddingTop: 12, paddingBottom: 8 },
  eyebrow: { color: "#087f8c", fontSize: 12, fontWeight: "700" },
  title: { color: "#17201b", fontSize: 30, fontWeight: "800", marginTop: 4 },
  status: { color: "#46524a", fontSize: 14, marginTop: 8 },
  panel: { backgroundColor: "#ffffff", borderColor: "#d7ddd2", borderRadius: 8, borderWidth: 1, padding: 14, gap: 10 },
  label: { color: "#253129", fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: "#fbfcfa",
    borderColor: "#cbd4c7",
    borderRadius: 8,
    borderWidth: 1,
    color: "#17201b",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  button: { alignItems: "center", borderRadius: 8, justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
  primaryButton: { backgroundColor: "#087f8c" },
  secondaryButton: { backgroundColor: "#eef6f4", borderColor: "#a8d8d1", borderWidth: 1 },
  disabledButton: { opacity: 0.55 },
  pressedButton: { transform: [{ scale: 0.99 }] },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryButtonText: { color: "#075f69" },
  segment: { backgroundColor: "#e8ece5", borderRadius: 8, flexDirection: "row", padding: 4 },
  segmentItem: { alignItems: "center", borderRadius: 6, flex: 1, minHeight: 40, justifyContent: "center" },
  segmentActive: { backgroundColor: "#ffffff", borderColor: "#cbd4c7", borderWidth: 1 },
  segmentText: { color: "#46524a", fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: "#17201b" },
  optionsRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  switchRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  optionText: { color: "#253129", fontSize: 14, fontWeight: "700" },
  maxLengthGroup: { alignItems: "center", flexDirection: "row", gap: 8 },
  maxLengthInput: {
    backgroundColor: "#fbfcfa",
    borderColor: "#cbd4c7",
    borderRadius: 8,
    borderWidth: 1,
    color: "#17201b",
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: 10,
    textAlign: "center",
    width: 76
  },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "center", paddingVertical: 8 },
  loadingText: { color: "#46524a", fontSize: 14, fontWeight: "700" },
  errorPanel: { backgroundColor: "#fff4f2", borderColor: "#f5b6ad", borderRadius: 8, borderWidth: 1, padding: 12 },
  errorText: { color: "#8b1d12", fontSize: 14, fontWeight: "700" },
  resultHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  panelTitle: { color: "#17201b", fontSize: 18, fontWeight: "800" },
  verdict: { borderRadius: 6, fontSize: 13, fontWeight: "800", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6 },
  realTone: { backgroundColor: "#e6f4ed", color: "#16794c" },
  fakeTone: { backgroundColor: "#fff0f0", color: "#b42318" },
  unverifiedTone: { backgroundColor: "#fff7e8", color: "#8a5700" },
  neutralTone: { backgroundColor: "#eef1ee", color: "#46524a" },
  metricRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 },
  metricLabel: { color: "#46524a", fontSize: 14 },
  metricValue: { color: "#17201b", fontSize: 14, fontWeight: "800" },
  reason: { color: "#253129", fontSize: 15, lineHeight: 21 },
  meta: { color: "#69736c", fontSize: 12 },
  evidenceItem: { color: "#253129", fontSize: 13, lineHeight: 18 },
  warningItem: { color: "#8a5700", fontSize: 13, fontWeight: "700" }
});
