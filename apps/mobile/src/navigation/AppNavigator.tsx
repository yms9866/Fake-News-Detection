import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "../components/BrandMark";
import { ConnectionPill } from "../components/ConnectionPill";
import { ErrorPanel } from "../components/ErrorPanel";
import { LoadingState } from "../components/LoadingState";
import { useWorkspace } from "../hooks/useWorkspace";
import { NAV_ITEMS, PRIMARY_TAB_ROUTES, MobileRoute, labelForRoute } from "./nav-items";
import { radius, space, type, useTheme } from "../theme";
import { AnalyzeScreen } from "../screens/AnalyzeScreen";
import { MediaScreen } from "../screens/MediaScreen";
import { CaptureScreen } from "../screens/CaptureScreen";
import { LiveScreen } from "../screens/LiveScreen";
import { ResultScreen } from "../screens/ResultScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { DiagnosticsScreen } from "../screens/DiagnosticsScreen";

function ScreenBody({ route }: { route: MobileRoute }) {
  switch (route) {
    case "analyze":
      return <AnalyzeScreen />;
    case "media":
      return <MediaScreen />;
    case "capture":
      return <CaptureScreen />;
    case "live":
      return <LiveScreen />;
    case "result":
      return <ResultScreen />;
    case "history":
      return <HistoryScreen />;
    case "report":
      return <ReportScreen />;
    case "review":
      return <ReviewScreen />;
    case "settings":
      return <SettingsScreen />;
    case "diagnostics":
      return <DiagnosticsScreen />;
    default:
      return <AnalyzeScreen />;
  }
}

export function AppNavigator() {
  const { colors } = useTheme();
  const { route, navigate, connection, checkConnection, loading, error, dismissError } = useWorkspace();
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryActive = PRIMARY_TAB_ROUTES.includes(route);

  return (
    <View style={[styles.shell, { backgroundColor: colors.bgApp }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.bgApp }]}>
        <BrandMark />
        <ConnectionPill
          status={connection.status}
          label={connection.label}
          onPress={() => void checkConnection()}
        />
      </View>

      {error ? (
        <View style={styles.banner}>
          <ErrorPanel message={error.message} onDismiss={dismissError} />
        </View>
      ) : null}
      {loading ? (
        <View style={styles.banner}>
          <LoadingState
            message={
              loading === "analyze"
                ? "Verification in progress"
                : loading === "media"
                  ? "Processing media"
                  : "Working"
            }
          />
        </View>
      ) : null}

      <View style={styles.content}>
        <ScreenBody route={route} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.bgSurfaceElevated, borderTopColor: colors.borderSubtle }]}>
        {PRIMARY_TAB_ROUTES.map((item) => {
          const active = route === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => navigate(item)}
              style={styles.tabItem}
            >
              <Text style={[styles.tabIcon, { color: active ? colors.accentPrimary : colors.textMuted }]}>
                {NAV_ITEMS[0].items.find((entry) => entry.route === item)?.icon || "•"}
              </Text>
              <Text style={[styles.tabLabel, { color: active ? colors.accentSecondary : colors.textMuted }]}>
                {labelForRoute(item)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => setMoreOpen(true)}
          style={styles.tabItem}
        >
          <Text style={[styles.tabIcon, { color: !primaryActive ? colors.accentPrimary : colors.textMuted }]}>⋯</Text>
          <Text style={[styles.tabLabel, { color: !primaryActive ? colors.accentSecondary : colors.textMuted }]}>
            More
          </Text>
        </Pressable>
      </View>

      <Modal visible={moreOpen} animationType="slide" transparent onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.bgSurfaceElevated, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>All menus</Text>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {NAV_ITEMS.map((section) => (
              <View key={section.section} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.section}</Text>
                {section.items.map((item) => {
                  const active = route === item.route;
                  return (
                    <Pressable
                      key={item.route}
                      onPress={() => {
                        navigate(item.route);
                        setMoreOpen(false);
                      }}
                      style={[
                        styles.menuRow,
                        {
                          backgroundColor: active ? colors.accentSoft : colors.bgSurfaceHover,
                          borderColor: active ? colors.brandBadgeBorder : colors.borderSubtle
                        }
                      ]}
                    >
                      <Text style={[styles.menuIcon, { color: colors.accentSecondary }]}>{item.icon}</Text>
                      <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  topBar: {
    borderBottomWidth: 1,
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.md
  },
  banner: {
    paddingHorizontal: space.xl,
    paddingTop: space.md
  },
  content: { flex: 1 },
  tabBar: {
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: space.sm,
    paddingTop: space.sm
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 52
  },
  tabIcon: {
    fontSize: 16,
    fontWeight: "800"
  },
  tabLabel: {
    ...type.label,
    fontSize: 11
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.35)",
    flex: 1
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    maxHeight: "70%",
    paddingBottom: space.xxl,
    paddingHorizontal: space.xl,
    paddingTop: space.lg
  },
  sheetTitle: {
    ...type.label,
    fontSize: 18,
    marginBottom: space.md
  },
  sheetBody: {
    gap: space.lg,
    paddingBottom: space.xl
  },
  section: {
    gap: space.sm
  },
  sectionTitle: {
    ...type.eyebrow,
    textTransform: "uppercase"
  },
  menuRow: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.md
  },
  menuIcon: {
    fontSize: 16,
    fontWeight: "800",
    width: 24
  },
  menuLabel: {
    ...type.label,
    fontSize: 15
  }
});
