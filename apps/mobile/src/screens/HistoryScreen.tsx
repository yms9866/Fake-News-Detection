import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, EmptyState, Panel, ScreenHeader } from "../components";
import { useWorkspace } from "../hooks/useWorkspace";
import { radius, space, type, useTheme } from "../theme";

export function HistoryScreen() {
  const { colors } = useTheme();
  const { historyList, actions } = useWorkspace();

  if (historyList.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
        <ScreenHeader eyebrow="Audit vault" title="Analysis History" />
        <EmptyState title="No history yet" message="Completed analyses will appear here for quick review." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgApp }]}>
      <ScreenHeader eyebrow="Audit vault" title="Analysis History" />
      {historyList.map((item) => (
        <Panel key={String(item.analysisId)}>
          <View style={styles.row}>
            <Badge
              label={String(item.finalVerdict || "Unknown")}
              tone={
                String(item.finalVerdict || "").includes("REAL")
                  ? "real"
                  : String(item.finalVerdict || "").includes("FAKE")
                    ? "fake"
                    : "uncertain"
              }
            />
            {item.confidence ? <Badge label={String(item.confidence)} /> : null}
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {String(item.title || item.analysisId)}
          </Text>
          {item.createdAt ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {new Date(String(item.createdAt)).toLocaleString()}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void actions.openHistory({ analysisId: String(item.analysisId || "") })}
            style={[styles.button, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>View result →</Text>
          </Pressable>
        </Panel>
      ))}
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  title: {
    ...type.label,
    fontSize: 16
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 44
  },
  buttonText: {
    ...type.button,
    fontSize: 14
  },
  footerSpacer: {
    height: space.xl
  }
});
