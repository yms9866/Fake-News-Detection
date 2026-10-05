import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type Option<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.bgSurfaceHover, borderColor: colors.borderSubtle }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            onPress={() => onChange(option.value)}
            style={[
              styles.item,
              active
                ? {
                    backgroundColor: colors.bgSurfaceElevated,
                    borderColor: colors.borderMedium,
                    borderWidth: 1,
                    shadowColor: colors.shadowColor,
                    shadowOpacity: 1,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1
                  }
                : null
            ]}
          >
            <Text style={[styles.label, { color: active ? colors.textPrimary : colors.textSecondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.xs,
    padding: space.xs
  },
  item: {
    alignItems: "center",
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 40
  },
  label: {
    ...type.label,
    fontSize: 14
  }
});
