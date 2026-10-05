import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, Panel, ScreenHeader, SourceRow } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, type, useTheme } from "../theme";

export function ReviewScreen() {
  const { colors } = useTheme();
  const { result } = useWorkspace();

  if (!result) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
        <ScreenHeader eyebrow="Evidence inspector" title="Review" />
        <EmptyState
          title="Nothing to review"
          message="Open a result or history item to inspect claims and sources."
        />
      </ScrollView>
    );
  }

  const claims = Array.isArray(result.claims) ? result.claims : [];
  const sources = Array.isArray(result.sources) ? result.sources : [];

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader eyebrow="Evidence inspector" title="Review" />
      <Panel>
        <Text style={[styles.body, { color: colors.textPrimary }]}>
          {`Final verdict: ${String(result.final_verdict || "UNVERIFIED")}`}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Style is not the verdict. Compare claims against reviewed sources.
        </Text>
      </Panel>

      {claims.map((claim, index) => {
        const item = claim as Record<string, unknown>;
        return (
          <Panel key={`claim-${index}`}>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{`Claim ${index + 1}`}</Text>
            <Text style={[styles.body, { color: colors.textPrimary }]}>
              {String(item.claim_text || "No text")}
            </Text>
          </Panel>
        );
      })}

      {sources.map((source, index) => {
        const item = source as Record<string, unknown>;
        return (
          <SourceRow
            key={`source-${index}`}
            title={String(item.title || "Untitled")}
            domain={String(item.domain || "")}
            stance={String(item.stance || "")}
            reliability={String(item.reliability || "")}
            url={String(item.url || "")}
          />
        );
      })}
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
  body: {
    ...type.body
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  footerSpacer: {
    height: space.xl
  }
});
