/**
 * Refuses a capability that only the desktop runtime has (history, backups,
 * archive swap, provider import, local AI, the external link window). The
 * message matches `requireDesktopRuntime` in `app/src/bridge/runtime.ts`, so
 * shared surfaces show one refusal whichever runtime raised it.
 *
 * @param capability Named in the thrown message, so the refusal is actionable.
 */
export function refuseDesktopOnly(capability: string): never {
  throw new Error(`${capability} needs the desktop app.`);
}

/**
 * Refuses a command the mobile command surface requires but the installed
 * native core does not expose yet. Kept apart from `refuseDesktopOnly`: these
 * clear with a newer `skriuw-core`, not with another product.
 *
 * @param capability Named in the thrown message, so the refusal is actionable.
 */
export function refuseMissingNativeCommand(capability: string): never {
  throw new Error(`${capability} needs a newer Skriuw mobile core.`);
}
