import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "./Badge";
import { Panel } from "./Panel";
import { radius, space, type, useTheme } from "../theme";

type SourceRowProps = {
  title: string;
  domain?: string;
  stance?: string;
  reliability?: string;
  url?: string;
  explanation?: string;
};

function stanceTone(stance: string): "real" | "fake" | "uncertain" | "neutral" {
  const value = String(stance || "").toUpperCase();
  if (value.includes("SUPPORT")) return "real";
  if (value.includes("CONTRADICT")) return "fake";
  if (value.includes("MENTION")) return "uncertain";
  return "neutral";
}

export function SourceRow({
  title,
  domain,
  stance,
  reliability,
  url,
  explanation
}: SourceRowProps) {
  const { colors } = useTheme();
  const initial = String(domain || title || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <Panel style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.avatarText, { color: colors.accentSecondary }]}>{initial}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title || domain || "Untitled source"}
          </Text>
          {domain ? <Text style={[styles.meta, { color: colors.textMuted }]}>{domain}</Text> : null}
        </View>
      </View>
      <View style={styles.badges}>
        {stance ? <Badge label={stance} tone={stanceTone(stance)} /> : null}
        {reliability ? <Badge label={`${reliability} reliability`} /> : null}
      </View>
      {explanation ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{explanation}</Text> : null}
      {url ? (
        <Pressable onPress={() => void Linking.openURL(url)}>
          <Text style={[styles.link, { color: colors.accentSecondary }]}>Open source</Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space.md
  },
  avatar: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800"
  },
  copy: {
    flex: 1,
    gap: 2
  },
  title: {
    ...type.label,
    fontSize: 14
  },
  meta: {
    ...type.body,
    fontSize: 12
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  link: {
    ...type.label,
    fontSize: 13
  }
});
