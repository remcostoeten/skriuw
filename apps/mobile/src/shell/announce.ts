import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * @name announce
 * @description Speaks a status change through VoiceOver. iOS ignores `accessibilityLiveRegion`, so a
 * toast or an error that only appears on screen is never heard there; Android keeps its live regions
 * and is skipped so TalkBack does not read the same text twice.
 *
 * @example
 * announce("Moved Groceries to Archive");
 */
export function announce(message: string): void {
  if (Platform.OS === "ios" && message.length > 0) {
    AccessibilityInfo.announceForAccessibility(message);
  }
}

/**
 * @name useAnnouncement
 * @description Announces `message` each time it changes to a new non-null value after the first
 * render, so opening a screen does not read out the status it already shows.
 *
 * @example
 * useAnnouncement(failure?.message ?? null);
 */
export function useAnnouncement(message: string | null): void {
  const previous = useRef(message);

  useEffect(() => {
    if (message !== null && message !== previous.current) {
      announce(message);
    }
    previous.current = message;
  }, [message]);
}

/**
 * @name useScreenReaderEnabled
 * @description Whether VoiceOver or TalkBack is running, following the setting while mounted.
 *
 * @example
 * const screenReader = useScreenReaderEnabled();
 * const duration = screenReader ? durationMs * 3 : durationMs;
 */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (active) {
          setEnabled(value);
        }
      })
      .catch((error: unknown) => console.warn("screen reader state unavailable", error));
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
