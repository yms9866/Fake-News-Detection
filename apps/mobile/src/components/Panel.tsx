import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { radius, space, useTheme } from "../theme";

type PanelProps = {
  children: React.ReactNode;
  elevated?: boolean;
  style?: ViewStyle;
};

export function Panel({ children, elevated = false, style }: PanelProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: elevated ? colors.bgSurfaceElevated : colors.bgSurfaceElevated,
          borderColor: colors.borderSubtle,
          shadowColor: colors.shadowColor
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.md,
    padding: space.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2
  }
});
