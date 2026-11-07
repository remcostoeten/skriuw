/** Stands in for `react-native` and `react-native-safe-area-context` in the mobile suite. */
import { flattenStyle, host } from "./native-host";

export const announcements: string[] = [];

export const AccessibilityInfo = {
  announceForAccessibility: (message: string) => {
    announcements.push(message);
  },
  isScreenReaderEnabled: async () => false,
  addEventListener: () => ({ remove: () => undefined }),
  sendAccessibilityEvent: () => undefined,
};
export const Keyboard = { dismiss: () => undefined };
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const Modal = host("Modal");
export const Platform = {
  OS: "ios",
  select: <T>(options: { ios?: T; default?: T }) => options.ios ?? options.default,
};
export const Pressable = host("Pressable");
export const ScrollView = host("ScrollView");
export const StyleSheet = {
  create: <T>(styles: T) => styles,
  flatten: flattenStyle,
  hairlineWidth: 1,
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
};
export const Text = host("Text");
export const TextInput = host("TextInput");
export const View = host("View");

export function useWindowDimensions() {
  return { width: 390, height: 844, scale: 3, fontScale: 1 };
}

export function useSafeAreaInsets() {
  return { top: 24, right: 0, bottom: 16, left: 0 };
}
