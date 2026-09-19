import { useMemo } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { edgeSwipeOpens, swipeAxis, type SheetSide } from "./edge-swipe";
import { TAB_BAR_HEIGHT, TOOLBAR_HEIGHT } from "./metrics";

type Props = {
  onOpen: (side: SheetSide) => void;
};

const STRIP_WIDTH = 20;

/**
 * The two edge strips the sheets open from. They sit between the toolbar row
 * and the tab bar so neither row's outermost control loses its edge to the
 * recogniser, which is where `.shell-edge` puts them on the web.
 */
export function EdgeSwipeZones({ onOpen }: Props) {
  const left = useEdgeResponder("left", onOpen);
  const right = useEdgeResponder("right", onOpen);

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <View {...left} style={[styles.strip, styles.left]} />
      <View {...right} style={[styles.strip, styles.right]} />
    </View>
  );
}

function useEdgeResponder(side: SheetSide, onOpen: (side: SheetSide) => void) {
  return useMemo(() => {
    let opened = false;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        swipeAxis({ x: 0, y: 0, edge: side }, gesture.dx, gesture.dy) === "x",
      onPanResponderGrant: () => {
        opened = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (opened || edgeSwipeOpens({ x: 0, y: 0, edge: side }, gesture.dx) === null) {
          return;
        }
        opened = true;
        onOpen(side);
      },
    }).panHandlers;
  }, [onOpen, side]);
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: TOOLBAR_HEIGHT,
    bottom: TAB_BAR_HEIGHT,
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
