import { AppState } from "react-native";
import { appPhase } from "./lock-lifecycle";
import type { AppPhase, Observable } from "./port";

/**
 * Binds the lifecycle to React Native's `AppState`. Kept apart from the
 * lifecycle itself so everything that reasons about phases stays testable
 * without the platform module.
 */
export function createAppPhaseSource(): Observable<AppPhase> {
  return {
    current: () => appPhase(AppState.currentState),
    subscribe: (listener) => {
      const subscription = AppState.addEventListener("change", (status) => {
        listener(appPhase(status));
      });
      return () => subscription.remove();
    },
  };
}
