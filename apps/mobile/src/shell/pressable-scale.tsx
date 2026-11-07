import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useReducedMotion, type CSSStyle } from "react-native-reanimated";
import { PRESS_EASING, PRESS_MS, PRESS_SCALE } from "./motion";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
};

const PRESS_RETENTION_PX = 16;

const SETTLE: CSSStyle<ViewStyle> = {
  transform: [{ scale: 1 }],
  transitionProperty: "transform",
  transitionDuration: PRESS_MS,
  transitionTimingFunction: PRESS_EASING,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ style, onPressIn, onPressOut, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
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
      style={[style, SETTLE, pressed && !reducedMotion ? styles.pressed : null]}
    />
  );
}

const styles = StyleSheet.create({
  pressed: {
    transform: [{ scale: PRESS_SCALE }],
  },
});
