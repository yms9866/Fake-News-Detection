import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Panel,
  ScreenHeader,
  SegmentedControl,
  TextField,
  ToggleRow
} from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, useTheme } from "../theme";

export function AnalyzeScreen() {
  const { colors } = useTheme();
  const { settings, actions, loading } = useWorkspace();
  const [mode, setMode] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [deepCheck, setDeepCheck] = useState(settings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(settings.defaultMaxLength));

  async function runAnalysis() {
    const trimmed = String(mode === "text" ? text : url).trim();
    if (!trimmed) {
      return;
    }
    if (mode === "text") {
      await actions.analyzeText({
        text: trimmed,
        deep_check: deepCheck,
        max_length: Number(maxLength) || settings.defaultMaxLength
      });
      return;
    }
    await actions.analyzeUrl({
      url: trimmed,
      deep_check: deepCheck,
      max_length: Number(maxLength) || settings.defaultMaxLength
    });
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}
      style={{ backgroundColor: colors.bgApp }}
    >
      <ScreenHeader
        eyebrow="Evidence-first verification"
        title="What would you like to verify?"
        lede="Paste a claim, article, headline, or source URL. Veritas analyzes available evidence through your local API."
      />

      <Panel>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "text", label: "Text" },
            { value: "url", label: "URL" }
          ]}
        />

        {mode === "text" ? (
          <TextField
            label="Claim or article text"
            multiline
            multilineArea
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setText}
            placeholder="Paste a claim, article, headline, or text to analyze…"
            value={text}
          />
        ) : (
          <TextField
            label="Source URL"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            onChangeText={setUrl}
            placeholder="https://example.com/article"
            value={url}
          />
        )}

        <ToggleRow
          title="Search for supporting evidence"
          description="Run Gemini Google Search grounding to strengthen verification."
          value={deepCheck}
          onValueChange={setDeepCheck}
        />

        <TextField
          label="Maximum analysis length"
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={setMaxLength}
          value={maxLength}
        />

        <Button
          label={loading === "analyze" ? "Verifying…" : "Verify now →"}
          onPress={() => void runAnalysis()}
          disabled={Boolean(loading)}
        />
      </Panel>
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
  footerSpacer: {
    height: space.xl
  }
});
