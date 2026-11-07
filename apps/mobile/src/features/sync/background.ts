/**
 * What this client honestly promises about syncing while it is not on screen.
 *
 * The temptation is to describe background sync as working and let the
 * platform quietly decide otherwise. It does not work that way: iOS suspends
 * sockets on background, grants `BGAppRefreshTask` on its own schedule and may
 * never grant it at all, and silent pushes are rate limited and droppable.
 * Android is better but still subject to Doze and to whatever the
 * manufacturer's battery manager decides.
 *
 * So the guarantee this client makes is the foreground one, and everything
 * else is named best-effort in the code as well as in the settings copy. This
 * module is what the account screen renders so the promise the user reads is
 * the promise the code makes.
 */

export type MobilePlatform = "ios" | "android";

export type BackgroundTrigger =
  | "foreground-resume"
  | "wake-channel"
  | "silent-push"
  | "scheduled-task";

export type BackgroundGuarantee = "guaranteed" | "best-effort" | "unavailable";

export type BackgroundCapability = {
  trigger: BackgroundTrigger;
  guarantee: BackgroundGuarantee;
  /** One sentence, shown in the account screen's sync explanation. */
  detail: string;
};

/**
 * The resume catch-up is the only entry that is ever `guaranteed`, and it is
 * guaranteed because it is the one the client itself controls.
 */
export function describeBackgroundStrategy(platform: MobilePlatform): BackgroundCapability[] {
  return [
    {
      trigger: "foreground-resume",
      guarantee: "guaranteed",
      detail: "Opening Skriuw always catches up with your other devices before anything else.",
    },
    {
      trigger: "wake-channel",
      guarantee: "best-effort",
      detail: "While Skriuw is open, changes from another device arrive within seconds.",
    },
    {
      trigger: "silent-push",
      guarantee: "unavailable",
      detail: "This build does not receive background notifications.",
    },
    platform === "ios"
      ? {
          trigger: "scheduled-task",
          guarantee: "best-effort",
          detail:
            "iOS decides when a background refresh runs, based on how you use Skriuw. It only runs while Skriuw is still in memory, and may not run for days.",
        }
      : {
          trigger: "scheduled-task",
          guarantee: "unavailable",
          detail: "Android does not refresh Skriuw in the background yet.",
        },
  ];
}

/** The one line the account screen leads with. */
export function backgroundStrategySummary(platform: MobilePlatform): string {
  return platform === "ios"
    ? "Skriuw syncs while it is open, and catches up the moment you reopen it. Background syncing is up to iOS and may not happen."
    : "Skriuw syncs while it is open, and catches up the moment you reopen it.";
}

export type BackgroundRefreshOutcome =
  | { kind: "completed" }
  /** The task was told to stop before the cycle settled. */
  | { kind: "expired" }
  | { kind: "failed"; message: string }
  /** Nothing in this process could refresh: no workspace is open in it. */
  | { kind: "skipped" };

export type BackgroundRefreshOptions = {
  /** `SyncLifecycle.backgroundRefresh`. */
  refresh: () => Promise<unknown>;
  /**
   * Resolves when the platform withdraws the window — `BGTask.expirationHandler`
   * on iOS, the headless task timeout on Android.
   */
  expiration: Promise<void>;
  reportError?: (error: unknown) => void;
};

/**
 * Runs one background cycle against a deadline the platform owns.
 *
 * It never throws and never leaves a rejected promise behind: a background
 * entry point that throws is a crash report the user sees as "Skriuw stopped",
 * for work that was optional to begin with. An expired window is reported as
 * expired rather than as a failure, because nothing went wrong — the resume
 * catch-up will redo it.
 */
export async function runBackgroundRefresh(
  options: BackgroundRefreshOptions,
): Promise<BackgroundRefreshOutcome> {
  const expired = Symbol("expired");
  try {
    const outcome = await Promise.race([
      options.refresh().then(() => "completed" as const),
      options.expiration.then(() => expired),
    ]);
    return outcome === expired ? { kind: "expired" } : { kind: "completed" };
  } catch (error) {
    options.reportError?.(error);
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

export type BackgroundRefreshSlot = {
  /** Offers the open workspace's refresh to scheduled tasks. Returns the withdrawal. */
  provide: (refresh: () => Promise<unknown>) => () => void;
  run: (
    expiration: Promise<void>,
    reportError?: (error: unknown) => void,
  ) => Promise<BackgroundRefreshOutcome>;
};

/**
 * @name createBackgroundRefreshSlot
 * @description Connects a platform-scheduled task to the account runtime that is mounted in the
 * same JavaScript instance. A task the platform runs in a headless instance, after the app was
 * terminated, finds the slot empty and skips: opening a second workspace handle there could race the
 * one the app opens when the user returns.
 *
 * @example
 * const slot = createBackgroundRefreshSlot();
 * const withdraw = slot.provide(() => runtime.backgroundRefresh());
 * const outcome = await slot.run(expiration);
 * withdraw();
 */
export function createBackgroundRefreshSlot(): BackgroundRefreshSlot {
  let current: (() => Promise<unknown>) | null = null;

  return {
    provide(refresh) {
      current = refresh;
      return () => {
        if (current === refresh) {
          current = null;
        }
      };
    },

    async run(expiration, reportError) {
      if (current === null) {
        return { kind: "skipped" };
      }
      return runBackgroundRefresh({ refresh: current, expiration, reportError });
    },
  };
}
