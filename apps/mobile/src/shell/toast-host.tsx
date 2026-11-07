import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";
import { useAnnouncement, useScreenReaderEnabled } from "./announce";
import { useChrome } from "./chrome";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { TOAST_ENTER_MS, TOAST_EXIT_MS } from "./motion";
import { PressableScale } from "./pressable-scale";
import { useTheme } from "./theme";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const TOAST_ENTER = FadeInDown.duration(TOAST_ENTER_MS).easing(EASE_OUT);
const TOAST_EXIT = FadeOutDown.duration(TOAST_EXIT_MS).easing(EASE_OUT);
const TOAST_ENTER_REDUCED = FadeIn.duration(TOAST_ENTER_MS);
const TOAST_EXIT_REDUCED = FadeOut.duration(TOAST_EXIT_MS);
const SCREEN_READER_DURATION_FACTOR = 3;

/**
 * The toast sits above the tab bar, which is what the compact shell does on
 * the web (`--toast-inset`), and above the software keyboard while it is up:
 * `inset` is the shell's live bottom inset, followed with a transform. Its
 * action is the undo for a destructive change, so it stays reachable for the
 * full duration and can only be taken once.
 */
export function ToastHost({ inset }: { inset: SharedValue<number> }) {
  const theme = useTheme();
  const { toast, dismissToast, runToastAction } = useChrome();
  const id = toast?.id ?? null;
  const screenReader = useScreenReaderEnabled();
  const durationMs = (toast?.durationMs ?? 0) * (screenReader ? SCREEN_READER_DURATION_FACTOR : 1);
  const reducedMotion = useReducedMotion();
  useAnnouncement(
    toast === null
      ? null
      : toast.action === null
        ? toast.message
        : `${toast.message}. ${toast.action.label} available.`,
  );
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -inset.get() }] }));

  useEffect(() => {
    if (id === null) {
      return;
    }
    const timer = setTimeout(() => dismissToast(id), durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [dismissToast, durationMs, id]);

  return (
    <Animated.View style={[styles.dock, lift]} pointerEvents="box-none">
      {toast === null ? null : (
        <Animated.View
          key={toast.id}
          entering={reducedMotion ? TOAST_ENTER_REDUCED : TOAST_ENTER}
          exiting={reducedMotion ? TOAST_EXIT_REDUCED : TOAST_EXIT}
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
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              onPress={() => runToastAction(toast.id)}
              style={styles.action}
            >
              <Text style={[styles.actionLabel, { color: theme.color("theme-accent-blue") }]}>
                {toast.action.label}
              </Text>
            </PressableScale>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  toast: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
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
