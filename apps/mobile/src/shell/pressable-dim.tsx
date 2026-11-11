import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { type CSSStyle } from "react-native-reanimated";
import { PRESS_DIM, PRESS_EASING, PRESS_MS } from "./motion";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
};

const PRESS_RETENTION_PX = 16;

const SETTLE: CSSStyle<ViewStyle> = {
  transitionProperty: "opacity",
  transitionDuration: PRESS_MS,
  transitionTimingFunction: PRESS_EASING,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableDim({ style, onPressIn, onPressOut, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      pressRetentionOffset={PRESS_RETENTION_PX}
      style={[styles.resting, style, SETTLE, pressed ? styles.pressed : null]}
    />
  );
}

const styles = StyleSheet.create({
  resting: {
    opacity: 1,
  },
  pressed: {
    opacity: PRESS_DIM,
  },
});
