import { settingsCopy } from "@/shared/ui/settings-copy";
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
    description: settingsCopy.about.browseTheCodeAndOpenPull,
    url: "https://github.com/remcostoeten/skriuw",
  },
  {
    id: "changelog",
    label: "Changelog",
    description: settingsCopy.about.seeWhatChangedInEachRelease,
    url: "https://github.com/remcostoeten/skriuw/releases",
  },
  {
    id: "issues",
    label: settingsCopy.about.reportAnIssue,
    description: settingsCopy.about.fileABugOrRequestA,
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
    return settingsCopy.about.automaticUpdatesArentSetUpFor;
  }
  if (outcome.status === "upToDate") {
    return settingsCopy.about.youreOnTheLatestVersion;
  }
  if (outcome.status === "available") {
    return `Version ${outcome.version} is available.`;
  }
  return outcome.message;
}
