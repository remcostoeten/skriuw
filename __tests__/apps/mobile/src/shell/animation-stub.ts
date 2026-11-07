/** Stands in for `react-native-reanimated`, `react-native-gesture-handler` and `react-native-worklets` in the mobile suite. */
import { host } from "./native-host";

type Chain = { [method: string]: (...args: unknown[]) => Chain };

function chain(): Chain {
  return new Proxy({} as Chain, { get: () => () => chain() });
}

function sharedValue<Value>(initial: Value) {
  let current = initial;
  return {
    get: () => current,
    set: (next: Value) => {
      current = next;
    },
  };
}

function gesture() {
  return { type: "gesture" };
}

const Animated = {
  View: host("Animated.View"),
  FlatList: host("Animated.FlatList"),
  createAnimatedComponent: (component: unknown) => component,
};

export default Animated;

export const Easing = { bezier: () => (value: number) => value };
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  return { x1, y1, x2, y2 };
}
export const Extrapolation = { CLAMP: "clamp" };
export const FadeIn = chain();
export const FadeInDown = chain();
export const FadeOut = chain();
export const FadeOutDown = chain();
export const LinearTransition = chain();
export const GestureDetector = host("GestureDetector");
export const GestureHandlerRootView = host("GestureHandlerRootView");

export function interpolate(value: number): number {
  return value;
}

export function scheduleOnRN(callback: (...args: unknown[]) => void, ...args: unknown[]): void {
  callback(...args);
}

export function useAnimatedStyle(): Record<string, never> {
  return {};
}

export function useCompetingGestures() {
  return gesture();
}

export function useLongPressGesture() {
  return gesture();
}

export function usePanGesture() {
  return gesture();
}

export function useReducedMotion(): boolean {
  return false;
}

export function useSharedValue<Value>(initial: Value) {
  return sharedValue(initial);
}

export function useTapGesture() {
  return gesture();
}

export function withSpring<Value>(value: Value): Value {
  return value;
}

export function withTiming<Value>(value: Value): Value {
  return value;
}
