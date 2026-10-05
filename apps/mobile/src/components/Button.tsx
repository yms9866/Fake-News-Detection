import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  style
}: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary
            ? colors.accentPrimary
            : isGhost
              ? "transparent"
              : colors.accentSoft,
          borderColor: isGhost ? colors.borderMedium : isPrimary ? colors.accentPrimary : colors.brandBadgeBorder,
          borderWidth: isPrimary ? 0 : 1,
          opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !disabled ? 0.99 : 1 }]
        },
        style
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: isPrimary ? colors.textOnAccent : colors.accentSecondary
          }
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: space.lg
  },
  label: {
    ...type.button
  }
});
