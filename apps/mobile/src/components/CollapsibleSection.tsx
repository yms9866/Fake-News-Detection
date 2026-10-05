import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "./Panel";
import { space, type, useTheme } from "../theme";

type CollapsibleSectionProps = {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
};

export function CollapsibleSection({
  title,
  children,
  initiallyOpen = false
}: CollapsibleSectionProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <Panel>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    ...type.label,
    fontSize: 15
  },
  chevron: {
    fontSize: 16,
    fontWeight: "700"
  },
  body: {
    gap: space.md,
    paddingTop: space.sm
  }
});
