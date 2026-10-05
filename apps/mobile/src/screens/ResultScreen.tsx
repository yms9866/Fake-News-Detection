import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ResultView, ScreenHeader } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, useTheme } from "../theme";

export function ResultScreen() {
  const { colors } = useTheme();
  const { result } = useWorkspace();
  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader eyebrow="Verification intelligence report" title="Analysis Result" />
      <ResultView result={result} />
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
