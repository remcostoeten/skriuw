import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StartupFailureView } from "../bridge/startup-failure";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { useTheme } from "./theme";

type Props = {
  /** `null` while the workspace is still opening. */
  view: StartupFailureView | null;
};

/**
 * Startup, and the one screen that survives a workspace that will not open
 * (`docs/specs/mobile-app.md`, R-Q1). A recovery-relevant failure stays on
 * screen with its actions rather than falling back to an empty workspace.
 */
export function StartupScreen({ view }: Props) {
  const theme = useTheme();

  if (view === null) {
    return (
      <View style={[styles.root, { backgroundColor: theme.color("background") }]}>
        <ActivityIndicator accessibilityLabel="Opening your workspace" color={theme.color("muted-foreground")} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.color("background") }]}>
      <SafeAreaView style={styles.frame}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color("foreground") }]}
        >
          {view.title}
        </Text>
        <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
          {view.detail}
        </Text>
        {view.hint === null ? null : (
          <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
            {view.hint}
          </Text>
        )}
        <View style={styles.actions}>
          {view.actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: action.disabled === true }}
              disabled={action.disabled === true}
              onPress={action.onSelect}
              style={[
                styles.action,
                {
                  borderColor: theme.color(action.variant === "primary" ? "ring" : "border"),
                  backgroundColor:
                    action.variant === "dangerFilled" ? theme.color("destructive") : "transparent",
                  opacity: action.disabled === true ? 0.5 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.actionLabel,
                  {
                    color:
                      action.variant === "dangerFilled"
                        ? theme.color("destructive-foreground")
                        : action.variant === "danger"
                          ? theme.color("destructive")
                          : theme.color("foreground"),
                  },
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  actions: {
    marginTop: 8,
    gap: 8,
    alignSelf: "stretch",
  },
  action: {
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
});
