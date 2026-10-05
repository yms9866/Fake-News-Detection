import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Panel, ScreenHeader, TextField, ToggleRow } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, type, useTheme } from "../theme";

export function SettingsScreen() {
  const { colors } = useTheme();
  const { settings, saveSettings, diagnostics } = useWorkspace();
  const [origin, setOrigin] = useState(settings.backendOrigin);
  const [deepCheck, setDeepCheck] = useState(settings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(settings.defaultMaxLength));
  const [timeoutMs, setTimeoutMs] = useState(String(settings.requestTimeoutMs));
  const [saved, setSaved] = useState(false);

  const models = diagnostics?.models;
  const modelList = Array.isArray(models)
    ? models
    : models && typeof models === "object" && Array.isArray((models as { models?: unknown[] }).models)
      ? (models as { models: unknown[] }).models
      : [];

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader
        eyebrow="Preferences"
        title="Settings"
        lede="Manage your connection to the Veritas engine and default analysis parameters."
      />

      <Panel>
        <Text style={[styles.section, { color: colors.textPrimary, borderBottomColor: colors.borderSubtle }]}>
          Connection
        </Text>
        <TextField
          label="Backend origin"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={origin}
          onChangeText={setOrigin}
        />
        <TextField
          label="Request timeout (ms)"
          inputMode="numeric"
          keyboardType="number-pad"
          value={timeoutMs}
          onChangeText={setTimeoutMs}
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Deep check often needs 60–120 seconds for Google Search grounding.
        </Text>
      </Panel>

      <Panel>
        <Text style={[styles.section, { color: colors.textPrimary, borderBottomColor: colors.borderSubtle }]}>
          Analysis defaults
        </Text>
        <ToggleRow
          title="Search for supporting evidence"
          description="Enable deep web search by default for all verifications."
          value={deepCheck}
          onValueChange={setDeepCheck}
        />
        <TextField
          label="Maximum analysis length"
          inputMode="numeric"
          keyboardType="number-pad"
          value={maxLength}
          onChangeText={setMaxLength}
        />
        <Button
          label="Save settings"
          onPress={() => {
            saveSettings({
              ...settings,
              backendOrigin: origin,
              defaultDeepCheck: deepCheck,
              defaultMaxLength: Number(maxLength) || 512,
              requestTimeoutMs: Number(timeoutMs) || 120000
            });
            setSaved(true);
          }}
        />
        {saved ? <Text style={[styles.hint, { color: colors.statusRealText }]}>Settings saved.</Text> : null}
      </Panel>

      <Panel>
        <Text style={[styles.section, { color: colors.textPrimary, borderBottomColor: colors.borderSubtle }]}>
          Models
        </Text>
        {modelList.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Open Diagnostics and refresh to load models.
          </Text>
        ) : (
          modelList.map((model, index) => (
            <Text key={index} style={[styles.body, { color: colors.textPrimary }]}>
              {String((model as { name?: string }).name || model)}
            </Text>
          ))
        )}
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
  section: {
    ...type.label,
    borderBottomWidth: 1,
    fontSize: 15,
    marginBottom: space.sm,
    paddingBottom: space.sm
  },
  hint: {
    ...type.body,
    fontSize: 12
  },
  body: {
    ...type.body
  },
  footerSpacer: {
    height: space.xl
  }
});
