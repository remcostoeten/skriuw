import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Whether a software keyboard is on screen. The tab bar steps aside for it,
 * the way `:root[data-keyboard="open"]` hides it in the compact shell.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setVisible(true),
    );
    const hidden = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return visible;
}
