import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { space, type, useTheme } from "../theme";

type ErrorPanelProps = {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ErrorPanel({ message, onRetry, onDismiss }: ErrorPanelProps) {
  const { colors } = useTheme();
  return (
    <Panel style={{ backgroundColor: colors.errorBg, borderColor: colors.errorBorder }}>
      <Text style={[styles.title, { color: colors.errorText }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.errorText }]}>{message}</Text>
      <View style={styles.actions}>
        {onRetry ? <Button label="Retry" onPress={onRetry} style={styles.action} /> : null}
        {onDismiss ? (
          <Button label="Dismiss" onPress={onDismiss} variant="secondary" style={styles.action} />
        ) : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.label,
    fontSize: 15
  },
  message: {
    ...type.body
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  action: {
    flexGrow: 1,
    minWidth: 120
  }
});
