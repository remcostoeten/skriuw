import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { AXIS_LOCK_PX, sheetDragCloses, sheetDragOffset, type SheetSide } from "./edge-swipe";
import { ShellIcon } from "./icons";
import {
  MINIMUM_TOUCH_TARGET,
  SCRIM_ALPHA,
  SHEET_DURATION_MS,
  TOOLBAR_HEIGHT,
  sheetWidth,
} from "./metrics";
import {
  CLOSE_PROJECTION_FRACTION,
  PAN_REACH_PX,
  SETTLE_SPRING,
  SHEET_CURVE,
  SHEET_PAN_LOCK_PX,
  clamp,
  projectVelocity,
} from "./motion";
import { useTheme } from "./theme";
import { PressableScale } from "./pressable-scale";

type Props = {
  side: SheetSide;
  open: boolean;
  title: string;
  onClose: () => void;
  overlay?: ReactNode;
  children: ReactNode;
};

/**
 * A side sheet on the compact shell's contract: `min(86vw, 360)` wide,
 * travelling 260 ms along `cubic-bezier(0.32, 0.72, 0, 1)`, closing to the
 * scrim, to its own control, to the back gesture, and to a pull back toward
 * the edge it is anchored to. Tree rows own their own horizontal swipe, so a
 * pull that starts on a row deletes it instead, as on the web.
 *
 * Position is one shared value, so the open and close timing, the drag and the
 * spring a release settles with all run on the UI thread and hand over
 * without a seam. A release carries the finger's velocity into the spring.
 *
 * It renders in a transparent `Modal` because `accessibilityViewIsModal` is
 * iOS-only: the modal's own window is what keeps TalkBack from swiping out of
 * an open sheet into the shell behind it. A modal is its own native root on
 * Android, so it carries its own gesture root. For the same reason anything
 * that must stay reachable above an open sheet, such as the undo toast, comes
 * in through `overlay` and renders inside the modal.
 */
export function SideSheet({ side, open, title, onClose, overlay, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const width = sheetWidth(windowWidth);
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(open ? 1 : 0);
  const dragStart = useSharedValue(1);
  const dragOrigin = useSharedValue(0);
  const wanted = useSharedValue(open ? 1 : 0);
  const settledByGesture = useRef(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    wanted.set(open ? 1 : 0);
    if (open) {
      settledByGesture.current = false;
      setMounted(true);
    } else if (settledByGesture.current) {
      settledByGesture.current = false;
      return;
    }
    progress.set(
      withTiming(open ? 1 : 0, { duration: SHEET_DURATION_MS, easing: SHEET_CURVE }, (finished) => {
        if (finished && !open) {
          scheduleOnRN(settleClosed);
        }
      }),
    );
  }, [open, progress, wanted]);

  function settleClosed() {
    if (!openRef.current) {
      setMounted(false);
    }
  }

  function closeFromGesture() {
    settledByGesture.current = true;
    onClose();
  }

  const pan = usePanGesture({
    activeOffsetX:
      side === "left" ? [-SHEET_PAN_LOCK_PX, PAN_REACH_PX] : [-PAN_REACH_PX, SHEET_PAN_LOCK_PX],
    failOffsetY: [-AXIS_LOCK_PX, AXIS_LOCK_PX],
    onActivate: (event) => {
      dragStart.set(progress.get());
      dragOrigin.set(event.translationX);
    },
    onUpdate: (event) => {
      if (wanted.get() === 0) {
        return;
      }
      const pushed = Math.abs(sheetDragOffset(side, event.translationX - dragOrigin.get()));
      progress.set(clamp(dragStart.get() - pushed / width, 0, 1));
    },
    onDeactivate: (event) => {
      if (wanted.get() === 0) {
        return;
      }
      const direction = side === "left" ? -1 : 1;
      const travelled = event.translationX - dragOrigin.get();
      const towardVelocity = direction * event.velocityX;
      const closes =
        !event.canceled &&
        (sheetDragCloses(side, travelled) ||
          direction * travelled + projectVelocity(towardVelocity) >=
            width * CLOSE_PROJECTION_FRACTION);
      if (closes) {
        progress.set(
          withSpring(0, { ...SETTLE_SPRING, velocity: -towardVelocity / width }, (finished) => {
            if (finished) {
              scheduleOnRN(settleClosed);
            }
          }),
        );
        scheduleOnRN(closeFromGesture);
        return;
      }
      progress.set(withSpring(1, { ...SETTLE_SPRING, velocity: -towardVelocity / width }));
    },
  });

  const hidden = side === "left" ? -width : width;
  const panelStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: interpolate(progress.get(), [0, 1], [0, 1], "clamp") }
      : { transform: [{ translateX: interpolate(progress.get(), [0, 1], [hidden, 0], "clamp") }] },
  );
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, SCRIM_ALPHA], "clamp"),
  }));

  if (!mounted) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View
          accessibilityViewIsModal={open}
          onAccessibilityEscape={onClose}
          style={StyleSheet.absoluteFill}
          pointerEvents={open ? "auto" : "none"}
        >
          <Animated.View
            accessibilityElementsHidden
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.color("scrim") }, scrimStyle]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              onPress={onClose}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.panel,
                side === "left"
                  ? {
                      left: 0,
                      paddingLeft: insets.left,
                      borderRightWidth: StyleSheet.hairlineWidth,
                    }
                  : {
                      right: 0,
                      paddingRight: insets.right,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                    },
                {
                  width,
                  paddingTop: insets.top,
                  paddingBottom: insets.bottom,
                  backgroundColor: theme.color("sidebar-background"),
                  borderColor: theme.color("sidebar-border"),
                },
                panelStyle,
              ]}
            >
              <View style={[styles.header, { borderBottomColor: theme.color("sidebar-border") }]}>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: theme.color("sidebar-foreground", 0.8) }]}
                >
                  {title}
                </Text>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${title.toLowerCase()}`}
                  onPress={onClose}
                  style={styles.close}
                >
                  <ShellIcon
                    name="close"
                    size={18}
                    color={theme.color("sidebar-foreground", 0.6)}
                  />
                </PressableScale>
              </View>
              <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.body}>
                {children}
              </KeyboardAvoidingView>
            </Animated.View>
          </GestureDetector>
          {open ? overlay : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: TOOLBAR_HEIGHT,
    paddingLeft: 14,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
  },
  close: {
    width: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
