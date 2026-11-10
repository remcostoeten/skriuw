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
