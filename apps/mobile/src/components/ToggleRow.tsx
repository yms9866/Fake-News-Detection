import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { space, type, useTheme } from "../theme";

type ToggleRowProps = {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleRow({ title, description, value, onValueChange }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {description ? (
          <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.meterTrack, true: colors.accentPrimary }}
        thumbColor={colors.bgSurfaceElevated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between"
  },
  copy: {
    flex: 1,
    gap: 2
  },
  title: {
    ...type.label,
    fontSize: 14
  },
  description: {
    ...type.body,
    fontSize: 12,
    lineHeight: 16
  }
});
