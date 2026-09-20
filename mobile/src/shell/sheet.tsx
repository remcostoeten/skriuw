import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  sheetDragCloses,
  sheetDragOffset,
  swipeAxis,
  type SheetSide,
} from "./edge-swipe";
import { ShellIcon } from "./icons";
import {
  MINIMUM_TOUCH_TARGET,
  SCRIM_ALPHA,
  SHEET_DURATION_MS,
  SHEET_EASING,
  TOOLBAR_HEIGHT,
  sheetWidth,
} from "./metrics";
import { useTheme } from "./theme";

type Props = {
  side: SheetSide;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

const SHEET_CURVE = Easing.bezier(
  SHEET_EASING.x1,
  SHEET_EASING.y1,
  SHEET_EASING.x2,
  SHEET_EASING.y2,
);

/**
 * A side sheet on the compact shell's contract: `min(86vw, 360)` wide,
 * travelling 260 ms along `cubic-bezier(0.32, 0.72, 0, 1)`, closing to the
 * scrim, to its own control, to the back gesture, and to a pull back toward
 * the edge it is anchored to.
 */
export function SideSheet({ side, open, title, onClose, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = sheetWidth(windowWidth);
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: SHEET_DURATION_MS,
      easing: SHEET_CURVE,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !open) {
        setMounted(false);
      }
    });
    return () => {
      animation.stop();
    };
  }, [open, progress]);

  const responder = useMemo(
    () =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        swipeAxis({ x: 0, y: 0, edge: side }, gesture.dx, gesture.dy) === "x" &&
        sheetDragOffset(side, gesture.dx) !== 0,
      onPanResponderMove: (_event, gesture) => {
        const offset = sheetDragOffset(side, gesture.dx);
        progress.setValue(Math.max(0, Math.min(1, 1 - Math.abs(offset) / width)));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (sheetDragCloses(side, gesture.dx)) {
          closeRef.current();
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: SHEET_DURATION_MS,
          easing: SHEET_CURVE,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
    [progress, side, width],
  );

  if (!mounted) {
    return null;
  }

  const hidden = side === "left" ? -width : width;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [hidden, 0] });
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, SCRIM_ALPHA] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.color("scrim"), opacity: scrimOpacity },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()}`}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal={open}
        {...responder.panHandlers}
        style={[
          styles.panel,
          side === "left"
            ? { left: 0, paddingLeft: insets.left, borderRightWidth: StyleSheet.hairlineWidth }
            : { right: 0, paddingRight: insets.right, borderLeftWidth: StyleSheet.hairlineWidth },
          {
            width,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: theme.color("sidebar-background"),
            borderColor: theme.color("sidebar-border"),
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.color("sidebar-border") }]}>
          <Text style={[styles.title, { color: theme.color("sidebar-foreground", 0.8) }]}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()}`}
            onPress={onClose}
            style={styles.close}
          >
            <ShellIcon name="close" size={18} color={theme.color("sidebar-foreground", 0.6)} />
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
      </Animated.View>
    </View>
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
