import { releasesUrl } from "@/data/content";

export type DesktopOs = "macos" | "windows" | "linux";

export type DetectedOs = DesktopOs | "unknown";

export const allPlatformsHref = "/download/";

export const desktopPlatforms: Record<
  DesktopOs,
  { name: string; label: string; files: string; href: string }
> = {
  macos: {
    name: "macOS",
    label: "Download for macOS",
    files: ".dmg for Apple silicon and Intel",
    href: releasesUrl,
  },
  windows: {
    name: "Windows",
    label: "Download for Windows",
    files: ".exe installer or .msi",
    href: releasesUrl,
  },
  linux: {
    name: "Linux",
    label: "Download for Linux",
    files: ".deb, .rpm, or AppImage",
    href: releasesUrl,
  },
};

export const desktopOrder: DesktopOs[] = ["macos", "windows", "linux"];

export const packageChannels: Array<{
  os: DesktopOs;
  anchor: string;
  platform: string;
  title: string;
  body: string;
  lines: string[];
}> = [
  {
    os: "macos",
    anchor: "macos",
    platform: "macOS",
    title: "Homebrew",
    body: "Install the signed desktop application through a dedicated cask.",
    lines: ["$ brew install --cask skriuw/tap/skriuw"],
  },
  {
    os: "windows",
    anchor: "windows",
    platform: "Windows",
    title: "Scoop",
    body: "Add the Skriuw bucket once, then install and update from the terminal.",
    lines: [
      "> scoop bucket add skriuw https://github.com/skriuw/scoop-bucket",
      "> scoop install skriuw",
    ],
  },
  {
    os: "linux",
    anchor: "linux",
    platform: "Debian / Ubuntu",
    title: "APT",
    body: "The repository publishes signed packages for Debian-family systems.",
    lines: [
      "$ curl -fsSL https://skriuw.github.io/packages/apt/key.gpg \\",
      "  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg",
      '$ echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] \\',
      '  https://skriuw.github.io/packages/apt stable main" \\',
      "  | sudo tee /etc/apt/sources.list.d/skriuw.list",
      "$ sudo apt update && sudo apt install skriuw",
    ],
  },
  {
    os: "linux",
    anchor: "fedora",
    platform: "Fedora / RHEL",
    title: "dnf",
    body: "Use the published RPM repository, or download an RPM directly.",
    lines: [
      "$ sudo dnf config-manager addrepo \\",
      "  --from-repofile=https://skriuw.github.io/packages/rpm/skriuw.repo",
      "$ sudo dnf install skriuw",
    ],
  },
];

/**
 * @name detectOs
 * @description Maps a user agent string to the desktop build that runs on it.
 * Phones, tablets (including iPadOS, which reports itself as a Mac) and
 * anything unrecognised resolve to `unknown` so callers can offer every
 * platform instead.
 *
 * @example
 * detectOs(navigator.userAgent, navigator.maxTouchPoints); // "macos"
 */
export function detectOs(userAgent: string, maxTouchPoints = 0): DetectedOs {
  if (/android|iphone|ipad|ipod|cros/i.test(userAgent)) return "unknown";
  if (/macintosh|mac os x/i.test(userAgent)) return maxTouchPoints > 1 ? "unknown" : "macos";
  if (/windows/i.test(userAgent)) return "windows";
  if (/linux|x11/i.test(userAgent)) return "linux";
  return "unknown";
}
