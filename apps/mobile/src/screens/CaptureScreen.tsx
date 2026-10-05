import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionCard } from "../components/ActionCard";
import { ScreenHeader } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { captureCameraStill, pickImageFromLibrary, pickMediaFile } from "../media/pickers";
import { space, type, useTheme } from "../theme";

export function CaptureScreen() {
  const { colors } = useTheme();
  const { actions, loading } = useWorkspace();
  const [localError, setLocalError] = useState("");

  async function runCapture(kind: "camera" | "gallery" | "audio" | "video" | "screenshot") {
    setLocalError("");
    try {
      const file =
        kind === "camera"
          ? await captureCameraStill()
          : kind === "gallery" || kind === "screenshot"
            ? await pickImageFromLibrary()
            : await pickMediaFile(kind === "audio" ? "audio" : "video");
      const mediaType = kind === "audio" ? "audio" : kind === "video" ? "video" : "image";
      await actions.uploadMedia(mediaType, file, file.name);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Capture failed.");
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader
        eyebrow="Real-time input"
        title="Capture"
        lede="Capture a camera still, gallery image, audio clip, or video and send it through the media pipeline."
      />
      <ActionCard
        icon="◎"
        title="Camera image"
        description="Take a snapshot and run image OCR + analysis."
        actionLabel={loading === "media" ? "Working…" : "Capture camera"}
        disabled={Boolean(loading)}
        onPress={() => void runCapture("camera")}
      />
      <ActionCard
        icon="▦"
        title="Gallery image"
        description="Pick a photo or screenshot from the device library."
        actionLabel="Choose gallery image"
        disabled={Boolean(loading)}
        onPress={() => void runCapture("gallery")}
      />
      <ActionCard
        icon="🎤"
        title="Audio selection"
        description="Select a recording, then transcribe and analyze."
        actionLabel="Choose audio"
        disabled={Boolean(loading)}
        onPress={() => void runCapture("audio")}
      />
      <ActionCard
        icon="▶"
        title="Video selection"
        description="Select a clip for speech/OCR extraction and analysis."
        actionLabel="Choose video"
        disabled={Boolean(loading)}
        onPress={() => void runCapture("video")}
      />
      {localError ? <Text style={[styles.error, { color: colors.errorText }]}>{localError}</Text> : null}
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
  error: {
    ...type.body,
    fontWeight: "700"
  },
  footerSpacer: {
    height: space.xl
  }
});
