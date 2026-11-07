import { noop } from "@skriuw/shared/helpers/noop";
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  impactAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from "expo-haptics";
import { Platform } from "react-native";

// Every Android version plays EFFECT_TICK for CONTEXT_CLICK; SEGMENT_TICK and GESTURE_THRESHOLD_ACTIVATE need API 34.
const ANDROID_TICK = AndroidHaptics.Context_Click;

function play(ios: () => Promise<void>, android: AndroidHaptics): void {
  const pending = Platform.OS === "android" ? performAndroidHapticsAsync(android) : ios();
  pending.catch(noop);
}

/**
 * @name tickHaptic
 * @description The lightest tick, for a value that stepped to its neighbour,
 * such as the journal moving one day. Fire and forget: it is never awaited,
 * and a device without haptics, or with them turned off, stays silent.
 *
 * @example
 * if (taken !== 0) {
 *   tickHaptic();
 *   step(taken);
 * }
 */
export function tickHaptic(): void {
  play(selectionAsync, ANDROID_TICK);
}

/**
 * @name snapHaptic
 * @description A light catch, for something that snapped into a new state
 * under the finger: a drag crossing the point where letting go commits, or a
 * task box ticking shut. Fire and forget, like `tickHaptic`.
 *
 * @example
 * scheduleOnRN(snapHaptic);
 */
export function snapHaptic(): void {
  play(() => impactAsync(ImpactFeedbackStyle.Light), ANDROID_TICK);
}

/**
 * @name holdHaptic
 * @description A firmer press, for a long press that took hold and opened
 * what it was held for. On Android it is the platform's own long-press
 * feedback. Fire and forget, like `tickHaptic`.
 *
 * @example
 * holdHaptic();
 * onLongPress(row);
 */
export function holdHaptic(): void {
  play(() => impactAsync(ImpactFeedbackStyle.Medium), AndroidHaptics.Long_Press);
}
