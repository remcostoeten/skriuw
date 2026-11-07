/** Stands in for `react-native-keyboard-controller` in the mobile suite. */
import { host } from "./native-host";

export const KeyboardProvider = host("KeyboardProvider");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const KeyboardStickyView = host("KeyboardStickyView");

export function useGenericKeyboardHandler(): void {}
