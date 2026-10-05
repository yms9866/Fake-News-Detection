import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type TextFieldProps = TextInputProps & {
  label: string;
  multilineArea?: boolean;
};

export function TextField({ label, multilineArea = false, style, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          multilineArea ? styles.area : null,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.borderMedium,
            color: colors.textPrimary
          },
          style
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { ...type.label },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: space.md,
    paddingVertical: space.md
  },
  area: {
    minHeight: 128,
    textAlignVertical: "top"
  }
});
