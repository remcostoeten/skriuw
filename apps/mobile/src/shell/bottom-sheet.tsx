import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from "react-native-gesture-handler";
import { KeyboardStickyView } from "react-native-keyboard-controller";
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
import { AXIS_LOCK_PX, CLOSE_DISTANCE_PX } from "./edge-swipe";
import { MINIMUM_TOUCH_TARGET, SCRIM_ALPHA, SHEET_DURATION_MS } from "./metrics";
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

type Props = {
  open: boolean;
  dismissLabel: string;
  onClose: () => void;
  onShow?: () => void;
  children: ReactNode;
};

export function BottomSheet({ open, dismissLabel, onClose, onShow, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const dragStart = useSharedValue(1);
  const dragOrigin = useSharedValue(0);
  const settledByGesture = useRef(false);
  const wanted = useSharedValue(open ? 1 : 0);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    wanted.set(open ? 1 : 0);
    if (open) {
      settledByGesture.current = false;
      setMounted(true);
    } else if (!mounted) {
      return;
    } else {
      Keyboard.dismiss();
      if (settledByGesture.current) {
        settledByGesture.current = false;
        return;
      }
    }
    progress.set(
      withTiming(open ? 1 : 0, { duration: SHEET_DURATION_MS, easing: SHEET_CURVE }, (finished) => {
        if (finished) {
          scheduleOnRN(open ? settleOpen : hide);
        }
      }),
    );
  }, [open, progress, wanted]);

  function hide() {
    if (openRef.current) {
      return;
    }
    setMounted(false);
  }

  // Android drops a focus request made before the dialog window takes input focus, which `onShow` can beat.
  function settleOpen() {
    if (openRef.current) {
      onShow?.();
    }
  }

  function closeFromGesture() {
    settledByGesture.current = true;
    onClose();
  }

  const pan = usePanGesture({
    activeOffsetY: [-PAN_REACH_PX, SHEET_PAN_LOCK_PX],
    failOffsetX: [-AXIS_LOCK_PX, AXIS_LOCK_PX],
    hitSlop: { top: 0, height: MINIMUM_TOUCH_TARGET },
    onActivate: (event) => {
      dragStart.set(progress.get());
      dragOrigin.set(event.translationY);
    },
    onUpdate: (event) => {
      if (wanted.get() === 0) {
        return;
      }
      const height = Math.max(sheetHeight.get(), 1);
      const pulled = event.translationY - dragOrigin.get();
      progress.set(clamp(dragStart.get() - pulled / height, 0, 1));
    },
    onDeactivate: (event) => {
      if (wanted.get() === 0) {
        return;
      }
      const height = Math.max(sheetHeight.get(), 1);
      const travelled = event.translationY - dragOrigin.get();
      const closes =
        !event.canceled &&
        (travelled >= CLOSE_DISTANCE_PX ||
          travelled + projectVelocity(event.velocityY) >= height * CLOSE_PROJECTION_FRACTION);
      if (closes) {
        progress.set(
          withSpring(0, { ...SETTLE_SPRING, velocity: -event.velocityY / height }, (finished) => {
            if (finished) {
              scheduleOnRN(hide);
            }
          }),
        );
        scheduleOnRN(closeFromGesture);
        return;
      }
      progress.set(withSpring(1, { ...SETTLE_SPRING, velocity: -event.velocityY / height }));
    },
  });

  const panelStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: interpolate(progress.get(), [0, 1], [0, 1], "clamp") }
      : {
          transform: [{ translateY: `${interpolate(progress.get(), [0, 1], [100, 0], "clamp")}%` }],
        },
  );
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, SCRIM_ALPHA], "clamp"),
  }));

  if (!mounted) {
    return null;
  }

  const sheet = (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents="box-none"
        onLayout={(event) => sheetHeight.set(event.nativeEvent.layout.height)}
        style={panelStyle}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={onShow}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.color("scrim") }, scrimStyle]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              onPress={onClose}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View accessibilityViewIsModal={open} onAccessibilityEscape={onClose}>
            <KeyboardStickyView offset={{ opened: insets.bottom }}>{sheet}</KeyboardStickyView>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
});
