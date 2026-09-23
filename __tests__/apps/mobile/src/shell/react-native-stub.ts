/** Stands in for `react-native` and `react-native-safe-area-context` in the mobile suite. */
import { flattenStyle, host } from "./native-host";

class AnimatedValue {
  setValue(): void {}
  interpolate(): number {
    return 0;
  }
}

export const Animated = {
  View: host("Animated.View"),
  Value: AnimatedValue,
  timing: () => ({ start: () => undefined, stop: () => undefined }),
};
export const Easing = { bezier: () => (value: number) => value };
export const Modal = host("Modal");
export const PanResponder = { create: () => ({ panHandlers: {} }) };
export const Pressable = host("Pressable");
export const ScrollView = host("ScrollView");
export const StyleSheet = {
  create: <T>(styles: T) => styles,
  flatten: flattenStyle,
  hairlineWidth: 1,
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
};
export const Text = host("Text");
export const View = host("View");

export function useWindowDimensions() {
  return { width: 390, height: 844, scale: 3, fontScale: 1 };
}

export function useSafeAreaInsets() {
  return { top: 24, right: 0, bottom: 16, left: 0 };
}
