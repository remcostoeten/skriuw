export const QUICK_ACTION_EVENT = "onQuickAction";

export type LaunchAnchor = "process-start" | "app-launch";

export type LaunchTiming = {
  elapsedMs: number;
  anchor: LaunchAnchor;
};

export type NativeLaunchTiming = {
  elapsedMs: number;
  anchor: string;
};

export type NativeSkriuwPlatform = {
  takeQuickAction(): string | null;
  launchTiming(): NativeLaunchTiming;
  addListener(
    eventName: typeof QUICK_ACTION_EVENT,
    listener: (event: { type: string }) => void,
  ): { remove(): void };
};

export type SkriuwPlatform = {
  takeQuickAction: () => string | null;
  subscribeQuickActions: (listener: (type: string) => void) => () => void;
  launchTiming: () => LaunchTiming | null;
};

const ANCHORS: readonly LaunchAnchor[] = ["process-start", "app-launch"];

function parseAnchor(anchor: string): LaunchAnchor | null {
  return ANCHORS.find((known) => known === anchor) ?? null;
}

/**
 * @name createSkriuwPlatform
 * @description Wraps the optional `SkriuwPlatform` native module. A build without it (the web
 * preview, an older development client) gets a surface that reports nothing rather than one that
 * throws, so quick actions and launch timing degrade to absent instead of breaking startup.
 *
 * @example
 * const platform = createSkriuwPlatform(requireOptionalNativeModule("SkriuwPlatform"));
 * const stop = platform.subscribeQuickActions((type) => console.info(type));
 * const pending = platform.takeQuickAction();
 */
export function createSkriuwPlatform(native: NativeSkriuwPlatform | null): SkriuwPlatform {
  return {
    takeQuickAction: () => native?.takeQuickAction() ?? null,

    subscribeQuickActions(listener) {
      if (native === null) {
        return () => undefined;
      }
      const subscription = native.addListener(QUICK_ACTION_EVENT, (event) => listener(event.type));
      return () => subscription.remove();
    },

    launchTiming() {
      if (native === null) {
        return null;
      }
      const timing = native.launchTiming();
      const anchor = parseAnchor(timing.anchor);
      if (anchor === null || !Number.isFinite(timing.elapsedMs) || timing.elapsedMs < 0) {
        return null;
      }
      return { elapsedMs: timing.elapsedMs, anchor };
    },
  };
}
