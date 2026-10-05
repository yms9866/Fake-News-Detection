import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { space, type, useTheme } from "../theme";

type ScreenHeaderProps = {
  eyebrow: string;
  title: string;
  lede?: string;
  trailing?: React.ReactNode;
};

export function ScreenHeader({ eyebrow, title, lede, trailing }: ScreenHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.accentSecondary }]}>{eyebrow}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        {trailing}
      </View>
      {lede ? <Text style={[styles.lede, { color: colors.textSecondary }]}>{lede}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    paddingBottom: space.sm,
    paddingTop: space.md
  },
  top: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between"
  },
  copy: {
    flex: 1,
    gap: space.xs
  },
  eyebrow: {
    ...type.eyebrow,
    textTransform: "uppercase"
  },
  title: {
    ...type.title
  },
  lede: {
    ...type.subtitle
  }
});
