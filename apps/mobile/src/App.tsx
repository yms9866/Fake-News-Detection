import React from "react";
import { SafeAreaView, StyleSheet, StatusBar } from "react-native";
import { ThemeProvider, useTheme } from "./theme";
import { WorkspaceProvider } from "./hooks/useWorkspace";
import { AppNavigator } from "./navigation/AppNavigator";

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

export function createMobileAppShell() {
  return {
    screens: [...MOBILE_SCREENS],
    localFirst: true,
    noOfflineVerificationPromise: true,
    providerSecretsInBundle: false
  };
}

function AppShell() {
  const { colors, mode } = useTheme();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgApp }]}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <WorkspaceProvider>
        <AppNavigator />
      </WorkspaceProvider>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  }
});
