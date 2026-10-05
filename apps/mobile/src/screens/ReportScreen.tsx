import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, Panel, ScreenHeader } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, type, useTheme } from "../theme";

export function ReportScreen() {
  const { colors } = useTheme();
  const { result } = useWorkspace();
  const [openDetails, setOpenDetails] = useState(false);

  if (!result) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
        <ScreenHeader eyebrow="Executive intelligence" title="Analysis Report" />
        <EmptyState title="No analysis data" message="Run an analysis to generate a detailed report." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader eyebrow="Executive intelligence" title="Analysis Report" />
      <Panel>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Summary</Text>
        <Text style={[styles.body, { color: colors.textPrimary }]}>
          {`Verdict: ${String(result.final_verdict || "Unknown")}`}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {`Confidence: ${String(result.confidence || "N/A")}`}
        </Text>
        {result.reason ? (
          <Text style={[styles.body, { color: colors.textPrimary }]}>{String(result.reason)}</Text>
        ) : null}
        <Pressable onPress={() => setOpenDetails((value) => !value)}>
          <Text style={[styles.link, { color: colors.accentSecondary }]}>
            {openDetails ? "Hide technical details" : "Technical details"}
          </Text>
        </Pressable>
        {openDetails ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {`Analysis ID: ${String(result.analysis_id || "—")}`}
          </Text>
        ) : null}
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
  heading: {
    ...type.label,
    fontSize: 16
  },
  body: {
    ...type.body
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  link: {
    ...type.label,
    fontSize: 13
  },
  footerSpacer: {
    height: space.xl
  }
});
