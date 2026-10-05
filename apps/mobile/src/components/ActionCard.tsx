import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type ActionCardProps = {
  title: string;
  description: string;
  icon: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ActionCard({
  title,
  description,
  icon,
  actionLabel,
  onPress,
  disabled = false
}: ActionCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgSurfaceElevated,
          borderColor: colors.borderSubtle,
          shadowColor: colors.shadowColor
        }
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.iconText, { color: colors.accentSecondary }]}>{icon}</Text>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.accentPrimary,
            opacity: disabled ? 0.5 : pressed ? 0.9 : 1
          }
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.md,
    padding: space.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  iconText: {
    fontSize: 18,
    fontWeight: "800"
  },
  title: {
    ...type.label,
    fontSize: 16
  },
  description: {
    ...type.body
  },
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: space.lg
  },
  buttonText: {
    ...type.button,
    fontSize: 14
  }
});
