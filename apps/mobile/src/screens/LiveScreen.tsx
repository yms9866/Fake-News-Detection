import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, Button, Panel, ScreenHeader, TextField } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, type, useTheme } from "../theme";

export function LiveScreen() {
  const { colors } = useTheme();
  const { actions, live, loading } = useWorkspace();
  const [ocrText, setOcrText] = useState("");
  const [framesSent, setFramesSent] = useState(0);
  const [localError, setLocalError] = useState("");

  const hasSession = Boolean(live?.session_id);
  const hasStableText = Boolean(String(live?.stable_text || "").trim());
  const latestVerification = live?.latest_verification as
    | { final_verdict?: string; confidence?: string; reason?: string }
    | null
    | undefined;

  async function submitFrame() {
    setLocalError("");
    const text = ocrText.trim();
    if (!text) {
      setLocalError("Paste readable OCR text before submitting a frame.");
      return;
    }
    try {
      await actions.submitLiveFrame({
        frame_id: `mobile-frame-${Date.now()}`,
        perceptual_hash: `hash-${framesSent + 1}`,
        ocr_text: text
      });
      setFramesSent((count) => count + 1);
      setOcrText("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not submit frame.");
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader
        eyebrow="Continuous monitoring"
        title="Live OCR Monitor"
        lede="Start a live session, submit readable OCR text frames, then verify once stable text is buffered."
      />

      <Panel>
        <Button
          label={loading === "live" ? "Starting…" : "Start live session"}
          onPress={() => void actions.startLive()}
          disabled={Boolean(loading)}
        />
        <TextField
          label="OCR text frame"
          multiline
          multilineArea
          value={ocrText}
          onChangeText={setOcrText}
          placeholder="Paste text captured from a screen, photo, or document…"
        />
        <Button
          label="Submit frame"
          onPress={() => void submitFrame()}
          variant="secondary"
          disabled={!hasSession || Boolean(loading)}
        />
        <Button
          label={loading === "verify" ? "Verifying…" : "Verify stable text"}
          onPress={() => void actions.verifyLive()}
          disabled={!hasSession || !hasStableText || Boolean(loading)}
        />
        {localError ? <Text style={[styles.error, { color: colors.errorText }]}>{localError}</Text> : null}
      </Panel>

      {live ? (
        <Panel>
          <View style={styles.badges}>
            <Badge label={hasSession ? "Session active" : "No session"} tone="info" />
            <Badge label={`${framesSent} frames sent`} />
            <Badge label={`${Number(live.buffer_chars ?? 0)} chars buffered`} />
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {hasStableText
              ? String(live.stable_text)
              : String(live.status || "Waiting for readable text.")}
          </Text>
          {!hasStableText && hasSession ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Verification unlocks once the session has stable OCR text.
            </Text>
          ) : null}
          {latestVerification ? (
            <View style={[styles.card, { borderColor: colors.borderSubtle, backgroundColor: colors.bgSurfaceHover }]}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Latest verification</Text>
              <Text style={[styles.body, { color: colors.textPrimary, fontWeight: "700" }]}>
                {`${String(latestVerification.final_verdict || "Unknown")} · ${String(latestVerification.confidence || "N/A")} confidence`}
              </Text>
              {latestVerification.reason ? (
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {String(latestVerification.reason)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Panel>
      ) : null}
      <View style={styles.footerSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.lg,
    padding: space.xl,
    paddingBottom: space.xxxl * 2
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  body: {
    ...type.body
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    gap: space.sm,
    padding: space.md
  },
  error: {
    ...type.body,
    fontWeight: "700"
  },
  footerSpacer: {
    height: space.xl
  }
});
