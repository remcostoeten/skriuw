import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useChrome } from "./chrome";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { useTheme } from "./theme";

/**
 * The toast sits above the tab bar, which is what the compact shell does on
 * the web (`--toast-inset`). Its action is the undo for a destructive change,
 * so it stays reachable for the full duration and can only be taken once.
 */
export function ToastHost() {
  const theme = useTheme();
  const { toast, dismissToast, runToastAction } = useChrome();
  const id = toast?.id ?? null;
  const durationMs = toast?.durationMs ?? 0;

  useEffect(() => {
    if (id === null) {
      return;
    }
    const timer = setTimeout(() => dismissToast(id), durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissToast, durationMs, id]);

  if (toast === null) {
    return null;
  }

  return (
    <View style={styles.dock} pointerEvents="box-none">
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { backgroundColor: theme.color("popover"), borderColor: theme.color("border") },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[styles.message, { color: theme.color("popover-foreground") }]}
        >
          {toast.message}
        </Text>
        {toast.action === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            onPress={() => runToastAction(toast.id)}
            style={styles.action}
          >
            <Text style={[styles.actionLabel, { color: theme.color("theme-accent-blue") }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  action: {
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
