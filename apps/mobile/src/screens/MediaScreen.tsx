import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Panel, ScreenHeader, SegmentedControl, TextField } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { pickMediaFile, uploadFromRemoteUrl } from "../media/pickers";
import { space, type, useTheme } from "../theme";

export function MediaScreen() {
  const { colors } = useTheme();
  const { actions, job, loading, settings } = useWorkspace();
  const [mediaType, setMediaType] = useState<"image" | "audio" | "video">("image");
  const [selectedName, setSelectedName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [picked, setPicked] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setPicked(null);
    setSelectedName("");
    setLocalError("");
  }, [mediaType]);

  async function chooseFile() {
    setLocalError("");
    try {
      const file = await pickMediaFile(mediaType);
      setPicked({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      setSelectedName(file.name);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not select a file.");
    }
  }

  async function chooseRemote() {
    setLocalError("");
    try {
      const file = await uploadFromRemoteUrl(remoteUrl, mediaType);
      setPicked({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      setSelectedName(file.name);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not load remote media.");
    }
  }

  async function analyze() {
    if (!picked) {
      setLocalError(`Select a ${mediaType} file first.`);
      return;
    }
    await actions.uploadMedia(mediaType, picked, picked.name);
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader
        eyebrow="Multimodal verification"
        title="Media Analysis"
        lede="Upload images, audio recordings, or video clips. Veritas extracts text or speech and checks it against evidence."
      />

      <Panel>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          How it works: Veritas extracts text or speech from your media and analyzes that content. It does not directly score visual deepfakes.
        </Text>
        <SegmentedControl
          value={mediaType}
          onChange={setMediaType}
          options={[
            { value: "image", label: "Image" },
            { value: "audio", label: "Audio" },
            { value: "video", label: "Video" }
          ]}
        />
        <Button
          label={selectedName ? `Selected: ${selectedName}` : `Select ${mediaType} file`}
          onPress={() => void chooseFile()}
          variant="secondary"
        />
        <TextField
          label="Or load from URL"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          placeholder={`https://example.com/file.${mediaType === "image" ? "jpg" : mediaType === "audio" ? "wav" : "mp4"}`}
          value={remoteUrl}
          onChangeText={setRemoteUrl}
        />
        <Button label="Load URL" onPress={() => void chooseRemote()} variant="ghost" />
        <ToggleHint deepCheck={settings.defaultDeepCheck} />
        <Button
          label={loading === "media" ? "Analyzing…" : `Analyze ${mediaType} →`}
          onPress={() => void analyze()}
          disabled={Boolean(loading) || !picked}
        />
        {localError ? <Text style={[styles.error, { color: colors.errorText }]}>{localError}</Text> : null}
      </Panel>

      {job ? (
        <Panel>
          <Text style={[styles.jobTitle, { color: colors.textPrimary }]}>
            {`Job status: ${String(job.status || "unknown")}`}
          </Text>
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {String(job.message || "Processing media pipeline…")}
          </Text>
          <Button label="Cancel job" onPress={() => void actions.cancelJob()} variant="secondary" />
        </Panel>
      ) : null}
      <View style={styles.footerSpacer} />
    </ScrollView>
  );
}

function ToggleHint({ deepCheck }: { deepCheck: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.note, { color: colors.textMuted }]}>
      {deepCheck
        ? "Deep check is on in Settings — media jobs will search for supporting evidence."
        : "Deep check is off in Settings — media jobs will run style-only verification."}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.lg,
    padding: space.xl,
    paddingBottom: space.xxxl * 2
  },
  note: {
    ...type.body,
    fontSize: 13
  },
  error: {
    ...type.body,
    fontWeight: "700"
  },
  jobTitle: {
    ...type.label,
    fontSize: 15
  },
  footerSpacer: {
    height: space.xl
  }
});
