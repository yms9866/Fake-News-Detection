import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, Panel, ScreenHeader } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { space, type, useTheme } from "../theme";

export function DiagnosticsScreen() {
  const { colors } = useTheme();
  const { diagnostics, actions, loading, settings } = useWorkspace();

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader
        eyebrow="System health"
        title="Diagnostics"
        lede="Check live/ready endpoints and inspect configured models on the local API."
      />

      <Panel>
        <Button
          label={loading === "diagnostics" ? "Refreshing…" : "Refresh diagnostics"}
          onPress={() => void actions.diagnostics()}
          disabled={Boolean(loading)}
        />
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {`Backend: ${settings.backendOrigin}`}
        </Text>
      </Panel>

      {!diagnostics ? (
        <EmptyState title="No diagnostics yet" message="Tap refresh to query the local API health endpoints." />
      ) : (
        <>
          <Panel>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Health</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {`Live: ${JSON.stringify(diagnostics.live)}`}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {`Ready: ${JSON.stringify(diagnostics.ready)}`}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {`Checked at ${String(diagnostics.checkedAt || "—")}`}
            </Text>
          </Panel>
          <Panel>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Models</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {JSON.stringify(diagnostics.models, null, 2)}
            </Text>
          </Panel>
        </>
      )}
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
    fontSize: 15
  },
  body: {
    ...type.body,
    fontSize: 12
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  footerSpacer: {
    height: space.xl
  }
});
