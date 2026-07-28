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
const h = React.createElement;

export function createMobileAppShell() {
  return {
    screens: [...MOBILE_SCREENS],
    localFirst: true,
    noOfflineVerificationPromise: true,
    providerSecretsInBundle: false
  };
}

function cleanOrigin(origin) {
  try {
    return normalizeApiUrl(origin || DEFAULT_API_URL);
  } catch {
    return DEFAULT_API_URL;
  }
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function verdictTone(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "REAL") {
    return styles.realTone;
  }
  if (normalized === "FAKE") {
    return styles.fakeTone;
  }
  if (normalized === "UNVERIFIED") {
    return styles.unverifiedTone;
  }
  return styles.neutralTone;
}

function Button(props) {
  const disabled = props.disabled;
  return h(
    Pressable,
    {
      accessibilityRole: "button",
      disabled,
      onPress: props.onPress,
      style: ({ pressed }) => [
        styles.button,
        props.secondary ? styles.secondaryButton : styles.primaryButton,
        disabled ? styles.disabledButton : null,
        pressed && !disabled ? styles.pressedButton : null
      ]
    },
    h(Text, { style: [styles.buttonText, props.secondary ? styles.secondaryButtonText : null] }, props.label)
  );
}

function FieldLabel(props) {
  return h(Text, { style: styles.label }, props.children);
}

function ResultPanel({ result }) {
  if (!result) {
    return null;
  }

  const evidence = result.verification && Array.isArray(result.verification.evidence)
    ? result.verification.evidence.slice(0, 3)
    : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  return h(
    View,
    { style: styles.panel },
    h(View, { style: styles.resultHeader },
      h(Text, { style: styles.panelTitle }, "Result"),
      h(Text, { style: [styles.verdict, verdictTone(result.final_verdict)] }, valueOrDash(result.final_verdict))
    ),
    h(View, { style: styles.metricRow },
      h(Text, { style: styles.metricLabel }, "Confidence"),
      h(Text, { style: styles.metricValue }, valueOrDash(result.confidence))
    ),
    h(View, { style: styles.metricRow },
      h(Text, { style: styles.metricLabel }, "Style"),
      h(Text, { style: styles.metricValue }, valueOrDash(result.style_signal))
    ),
    h(Text, { style: styles.reason }, valueOrDash(result.reason)),
    result.request_id ? h(Text, { style: styles.meta }, `Request ${result.request_id}`) : null,
    evidence.length > 0 ? h(View, { style: styles.evidenceList },
      evidence.map((item, index) => h(Text, { key: `${item.url || item.title || index}`, style: styles.evidenceItem },
        `${index + 1}. ${valueOrDash(item.title || item.url)}`
      ))
    ) : null,
    warnings.length > 0 ? h(View, { style: styles.warningList },
      warnings.map((warning, index) => h(Text, { key: `${warning}-${index}`, style: styles.warningItem }, warning))
    ) : null
  );
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
  const [result, setResult] = useState(null);
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

    const body = mode === "text"
      ? { text: trimmed, deep_check: deepCheck, max_length: Number(maxLength) || 512 }
      : { url: trimmed, deep_check: deepCheck, max_length: Number(maxLength) || 512 };

    try {
      const client = new MobileApiClient({ apiUrl: origin });
      const payload = mode === "text"
        ? await client.analyzeText(body)
        : await client.analyzeUrl(body);
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backend request failed.");
    } finally {
      setLoading(false);
    }
  }

  return h(
    SafeAreaView,
    { style: styles.safeArea },
    h(ScrollView, { keyboardShouldPersistTaps: "handled", contentContainerStyle: styles.container },
      h(View, { style: styles.header },
        h(Text, { style: styles.eyebrow }, "FAKE NEWS PLATFORM"),
        h(Text, { style: styles.title }, "Mobile Analysis"),
        h(Text, { style: styles.status }, `Backend: ${backendStatus}`)
      ),
      h(View, { style: styles.panel },
        h(FieldLabel, null, "Backend URL"),
        h(TextInput, {
          autoCapitalize: "none",
          autoCorrect: false,
          inputMode: "url",
          onChangeText: setBackendOrigin,
          style: styles.input,
          value: backendOrigin
        }),
        h(Button, { label: "Check Backend", onPress: checkBackend, secondary: true })
      ),
      h(View, { style: styles.segment },
        h(Pressable, {
          accessibilityRole: "button",
          onPress: () => setMode("text"),
          style: [styles.segmentItem, mode === "text" ? styles.segmentActive : null]
        }, h(Text, { style: [styles.segmentText, mode === "text" ? styles.segmentTextActive : null] }, "Text")),
        h(Pressable, {
          accessibilityRole: "button",
          onPress: () => setMode("url"),
          style: [styles.segmentItem, mode === "url" ? styles.segmentActive : null]
        }, h(Text, { style: [styles.segmentText, mode === "url" ? styles.segmentTextActive : null] }, "URL"))
      ),
      h(View, { style: styles.panel },
        h(FieldLabel, null, mode === "text" ? "Claim Text" : "Article URL"),
        h(TextInput, {
          autoCapitalize: "none",
          autoCorrect: false,
          inputMode: mode === "text" ? "text" : "url",
          multiline: mode === "text",
          onChangeText: mode === "text" ? setText : setUrl,
          placeholder: mode === "text" ? "Paste a claim" : "https://example.com/article",
          placeholderTextColor: "#7a8178",
          style: [styles.input, mode === "text" ? styles.textArea : null],
          value: mode === "text" ? text : url
        }),
        h(View, { style: styles.optionsRow },
          h(View, { style: styles.switchRow },
            h(Text, { style: styles.optionText }, "Deep check"),
            h(Switch, { value: deepCheck, onValueChange: setDeepCheck })
          ),
          h(View, { style: styles.maxLengthGroup },
            h(Text, { style: styles.optionText }, "Max"),
            h(TextInput, {
              inputMode: "numeric",
              keyboardType: "number-pad",
              onChangeText: setMaxLength,
              style: styles.maxLengthInput,
              value: maxLength
            })
          )
        ),
        h(Button, { label: loading ? "Analyzing" : "Analyze", onPress: runAnalysis, disabled: loading })
      ),
      loading ? h(View, { style: styles.loadingRow }, h(ActivityIndicator, { color: "#087f8c" }), h(Text, { style: styles.loadingText }, "Analyzing")) : null,
      error ? h(View, { style: styles.errorPanel }, h(Text, { style: styles.errorText }, error)) : null,
      h(ResultPanel, { result })
    )
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f8f5"
  },
  container: {
    padding: 20,
    gap: 14
  },
  header: {
    paddingTop: 12,
    paddingBottom: 8
  },
  eyebrow: {
    color: "#087f8c",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0
  },
  title: {
    color: "#17201b",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 4
  },
  status: {
    color: "#46524a",
    fontSize: 14,
    marginTop: 8
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d7ddd2",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 10
  },
  label: {
    color: "#253129",
    fontSize: 13,
    fontWeight: "700"
  },
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
  textArea: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  button: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  primaryButton: {
    backgroundColor: "#087f8c"
  },
  secondaryButton: {
    backgroundColor: "#eef6f4",
    borderColor: "#a8d8d1",
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.55
  },
  pressedButton: {
    transform: [{ scale: 0.99 }]
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButtonText: {
    color: "#075f69"
  },
  segment: {
    backgroundColor: "#e8ece5",
    borderRadius: 8,
    flexDirection: "row",
    padding: 4
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 40,
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd4c7",
    borderWidth: 1
  },
  segmentText: {
    color: "#46524a",
    fontSize: 14,
    fontWeight: "700"
  },
  segmentTextActive: {
    color: "#17201b"
  },
  optionsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  optionText: {
    color: "#253129",
    fontSize: 14,
    fontWeight: "700"
  },
  maxLengthGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
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
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 8
  },
  loadingText: {
    color: "#46524a",
    fontSize: 14,
    fontWeight: "700"
  },
  errorPanel: {
    backgroundColor: "#fff4f2",
    borderColor: "#f5b6ad",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  errorText: {
    color: "#8b1d12",
    fontSize: 14,
    fontWeight: "700"
  },
  resultHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  panelTitle: {
    color: "#17201b",
    fontSize: 18,
    fontWeight: "800"
  },
  verdict: {
    borderRadius: 6,
    fontSize: 13,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  realTone: {
    backgroundColor: "#e6f4ed",
    color: "#16794c"
  },
  fakeTone: {
    backgroundColor: "#fff0f0",
    color: "#b42318"
  },
  unverifiedTone: {
    backgroundColor: "#fff7e8",
    color: "#8a5700"
  },
  neutralTone: {
    backgroundColor: "#eef1ee",
    color: "#46524a"
  },
  metricRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  metricLabel: {
    color: "#46524a",
    fontSize: 14
  },
  metricValue: {
    color: "#17201b",
    fontSize: 14,
    fontWeight: "800"
  },
  reason: {
    color: "#253129",
    fontSize: 15,
    lineHeight: 21
  },
  meta: {
    color: "#69736c",
    fontSize: 12
  },
  evidenceList: {
    gap: 6
  },
  evidenceItem: {
    color: "#253129",
    fontSize: 13,
    lineHeight: 18
  },
  warningList: {
    gap: 6
  },
  warningItem: {
    color: "#8a5700",
    fontSize: 13,
    fontWeight: "700"
  }
});
