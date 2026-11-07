import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { AXIS_LOCK_PX, edgeSwipeOpens, type SheetSide } from "./edge-swipe";
import { TAB_BAR_HEIGHT, TOOLBAR_HEIGHT } from "./metrics";
import { PAN_REACH_PX, projectVelocity } from "./motion";

type Props = {
  onOpen: (side: SheetSide) => void;
};

type StripProps = {
  side: SheetSide;
  onOpen: (side: SheetSide) => void;
};

const STRIP_WIDTH = 20;

/**
 * The two edge strips the sheets open from. They sit between the toolbar row
 * and the tab bar so neither row's outermost control loses its edge to the
 * recogniser, which is where `.shell-edge` puts them on the web.
 */
export function EdgeSwipeZones({ onOpen }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.layer,
        { top: insets.top + TOOLBAR_HEIGHT, bottom: insets.bottom + TAB_BAR_HEIGHT },
      ]}
      pointerEvents="box-none"
    >
      <EdgeStrip side="left" onOpen={onOpen} />
      <EdgeStrip side="right" onOpen={onOpen} />
    </View>
  );
}

function EdgeStrip({ side, onOpen }: StripProps) {
  const opened = useSharedValue(false);
  const pan = usePanGesture({
    activeOffsetX: side === "left" ? [-PAN_REACH_PX, AXIS_LOCK_PX] : [-AXIS_LOCK_PX, PAN_REACH_PX],
    failOffsetY: [-AXIS_LOCK_PX, AXIS_LOCK_PX],
    onActivate: () => {
      opened.set(false);
    },
    onUpdate: (event) => {
      if (opened.get() || edgeSwipeOpens({ x: 0, y: 0, edge: side }, event.translationX) === null) {
        return;
      }
      opened.set(true);
      scheduleOnRN(onOpen, side);
    },
    onDeactivate: (event) => {
      if (opened.get() || event.canceled) {
        return;
      }
      const projected = event.translationX + projectVelocity(event.velocityX);
      if (edgeSwipeOpens({ x: 0, y: 0, edge: side }, projected) !== null) {
        opened.set(true);
        scheduleOnRN(onOpen, side);
      }
    },
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.strip, side === "left" ? styles.left : styles.right]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  strip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: STRIP_WIDTH,
  },
  left: {
    left: 0,
  },
  right: {
    right: 0,
  },
});
