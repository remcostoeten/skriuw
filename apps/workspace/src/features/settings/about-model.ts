import { getVersion } from "@tauri-apps/api/app";

export type AboutLink = {
  id: string;
  label: string;
  description: string;
  url: string;
};

export const ABOUT_LINKS: readonly AboutLink[] = [
  {
    id: "repository",
    label: "Source repository",
    description: "Browse the code and open pull requests.",
    url: "https://github.com/remcostoeten/skriuw",
  },
  {
    id: "changelog",
    label: "Changelog",
    description: "See what changed in each release.",
    url: "https://github.com/remcostoeten/skriuw/releases",
  },
  {
    id: "issues",
    label: "Report an issue",
    description: "File a bug or request a feature.",
    url: "https://github.com/remcostoeten/skriuw/issues/new",
  },
];

/**
 * Reads the packaged application version. Falls back to a stable label when the
 * Tauri host is unavailable (e.g. the browser e2e harness).
 */
export function readAppVersion(): Promise<string> {
  return getVersion().catch(() => "dev");
}

export type UpdateOutcome =
  | { status: "unconfigured" }
  | { status: "upToDate" }
  | { status: "available"; version: string }
  | { status: "error"; message: string };

/**
 * Checks for an application update. Automatic updates require a signing keypair
 * and a hosted release feed; until those exist this resolves to `unconfigured`.
 * Swap the body for `@tauri-apps/plugin-updater` `check()` once the feed ships.
 */
export function checkForUpdate(): Promise<UpdateOutcome> {
  return Promise.resolve({ status: "unconfigured" });
}

export function describeUpdateOutcome(outcome: UpdateOutcome): string {
  if (outcome.status === "unconfigured") {
    return "Automatic updates aren’t set up for this build yet.";
  }
  if (outcome.status === "upToDate") {
    return "You’re on the latest version.";
  }
  if (outcome.status === "available") {
    return `Version ${outcome.version} is available.`;
  }
  return outcome.message;
}
