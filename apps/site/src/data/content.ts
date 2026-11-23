export const appUrl = "/app/";
export const repoUrl = "https://github.com/remcostoeten/skriuw";
export const releasesUrl = "https://github.com/remcostoeten/skriuw/releases/latest";

export const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Local-first", href: "/local-first-notes/" },
  { label: "Markdown", href: "/markdown-notes/" },
  { label: "Import", href: "/import/" },
  { label: "Docs", href: "/docs/" },
  { label: "Download", href: "/download/" },
  { label: "Source", href: repoUrl },
];

export const statusSuggestions = [
  {
    label: "Open the app",
    href: appUrl,
    hint: "Write in the browser, no account, nothing to install.",
  },
  {
    label: "Local-first",
    href: "/local-first-notes/",
    hint: "Where your notes live and what leaves the machine.",
  },
  {
    label: "Import",
    href: "/import/",
    hint: "Bring a vault from Obsidian, Notion, Bear, or Apple Notes.",
  },
  {
    label: "Download",
    href: "/download/",
    hint: "Builds for macOS, Windows, and Linux.",
  },
];

export const importSources = [
  {
    name: "Obsidian",
    format: "vault folder",
    keeps: "Folder tree, frontmatter, wikilinks",
  },
  {
    name: "Notion",
    format: "Markdown & CSV zip",
    keeps: "Databases become typed properties",
  },
  { name: "Bear", format: ".bear2bk", keeps: "TextBundles, images, tags" },
  {
    name: "Apple Notes",
    format: "exported .md",
    keeps: "Exported files only, not Apple's database",
  },
  { name: "Evernote", format: ".enex", keeps: "Checkboxes, code, tables" },
  {
    name: "Joplin",
    format: "RAW folder",
    keeps: "Nested notebooks, resources",
  },
  {
    name: "Google Keep",
    format: "Takeout folder",
    keeps: "Checklists, labels, pin, color",
  },
  { name: "Simplenote", format: "notes.json", keeps: "Tags, timestamps, pins" },
  {
    name: "Standard Notes",
    format: "decrypted backup",
    keeps: "Tags via references",
  },
  { name: "Skriuw v1", format: "vault folder", keeps: "Journal days, moods, tags" },
  { name: "Markdown", format: ".md folder", keeps: "Unknown syntax stays raw" },
  { name: "Plain text", format: ".txt", keeps: "One note per file" },
  { name: "ZIP", format: ".zip", keeps: "Scanned before the workspace changes" },
];

export const bentoCards = [
  {
    keys: "⌘ /",
    hint: "toggle source",
    vignette: "editor" as const,
    title: "Rich text editor that saves Markdown",
    body: "Type `# `, `- ` or `**bold**` and the text formats as you write. Switch to the raw Markdown source at any time.",
    span: "lg:col-span-8",
  },
  {
    keys: "d",
    hint: "go to date",
    vignette: "journal" as const,
    title: "Daily journal",
    body: "One entry per day, with a mood and a calendar. An On this day section lists entries from a week ago, a month ago and earlier years.",
    span: "lg:col-span-4",
  },
  {
    keys: "# $ @",
    hint: "reference anything",
    vignette: "links" as const,
    title: "Tags, people, and note links",
    body: "Type # for a tag, $ for a person and @ for a note link. Links are stored by ID, so renaming a note, tag or person updates every mention.",
    span: "lg:col-span-4",
  },
  {
    keys: "auto",
    hint: "on every save",
    vignette: "history" as const,
    title: "Version history for every note",
    body: "Skriuw records each save in Git in the background, so typing never waits for it. Open a version as a diff and restore it.",
    span: "lg:col-span-4",
  },
  {
    keys: "⌘ ⇧ L",
    hint: "lock folder",
    vignette: "lock" as const,
    title: "Locked notes and encrypted sync",
    body: "Lock a note or a folder behind a PIN or passphrase. Sync is end-to-end encrypted, so the sync server stores data it can't read.",
    span: "lg:col-span-4",
  },
  {
    keys: "⌘ K",
    hint: "command palette",
    vignette: "palette" as const,
    title: "Command palette",
    body: "Search note titles and bodies, run commands, and open notes in tabs or a split view. You can remap shortcuts in settings.",
    span: "lg:col-span-12",
    wide: true,
  },
];

export const proofPoints = [
  {
    label: "typing",
    title: "Typing doesn't wait for storage",
    body: "The editor updates in memory first. The save to disk happens afterward and doesn't block the next keystroke.",
  },
  {
    label: "opening notes",
    title: "Switching notes doesn't wait for storage",
    body: "The performance contract requires that navigation never waits for disk, IPC or the network.",
  },
  {
    label: "tests",
    title: "More than 1,300 automated tests",
    body: "They cover the backend, desktop app, renderer, store and UI architecture, plus a keyboard-driven end-to-end suite.",
  },
];

export const proofMeasure =
  "Budget for keystroke to paint: under 8 ms for 95 of every 100 keystrokes.";

export const themes = [
  {
    name: "Skriuw",
    bg: "#1d1b1b",
    ink: "#e8e4df",
    note: "the default, light text on a near-black background.",
  },
  {
    name: "Paper",
    bg: "#efe9df",
    ink: "#3a352e",
    note: "dark text on a light background.",
  },
  {
    name: "Embers",
    bg: "#2a1a16",
    ink: "#e9a178",
    note: "orange text on a dark brown background.",
  },
  {
    name: "Catppuccin",
    bg: "#1e1e2e",
    ink: "#cba6f7",
    note: "the Catppuccin Mocha palette.",
  },
  {
    name: "Rosé Pine",
    bg: "#191724",
    ink: "#ebbcba",
    note: "pink text on a dark purple background.",
  },
  {
    name: "Gruvbox",
    bg: "#282828",
    ink: "#fabd2f",
    note: "yellow text on a dark gray background.",
  },
  {
    name: "Tokyo Night",
    bg: "#1a1b26",
    ink: "#7aa2f7",
    note: "blue text on a dark blue background.",
  },
];

export const installChannels = [
  {
    name: "Browser",
    icon: "browser" as const,
    summary:
      "The same Rust core as the desktop app, compiled to WebAssembly and running in your tab.",
    hint: "No install needed. The installed browser app starts from disk when offline.",
    cta: "Open the app",
    href: appUrl,
    ctaVariant: "solid" as const,
    featured: true,
  },
  {
    name: "macOS",
    icon: "macos" as const,
    summary: "Installer from the latest GitHub release, or install with Homebrew.",
    hint: "`brew install --cask skriuw/tap/skriuw`",
    cta: "Download for macOS",
    href: releasesUrl,
    ctaVariant: "outline" as const,
    featured: false,
  },
  {
    name: "Linux",
    icon: "linux" as const,
    summary: "Packages for APT and dnf, an AUR package and an AppImage.",
    hint: "Signed APT and dnf repositories, AUR, AppImage",
    cta: "Download for Linux",
    href: releasesUrl,
    ctaVariant: "outline" as const,
    featured: false,
  },
  {
    name: "Windows",
    icon: "windows" as const,
    summary: "Installer from the latest GitHub release, or install with Scoop.",
    hint: "`scoop install skriuw`",
    cta: "Download for Windows",
    href: releasesUrl,
    ctaVariant: "outline" as const,
    featured: false,
  },
];

export const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Open the app", href: appUrl },
      { label: "Download", href: releasesUrl },
      { label: "Features", href: "/docs/features/" },
      { label: "Changelog", href: "/changelog/" },
    ],
  },
  {
    title: "Engineering",
    links: [
      { label: "All documentation", href: "/docs/" },
      { label: "Architecture", href: "/docs/architecture/" },
      { label: "Performance contract", href: "/docs/performance-contract/" },
      { label: "Decision records", href: "/docs/adr/" },
      { label: "Benchmarks", href: `${repoUrl}/tree/daddy/docs/benchmarks` },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Source on GitHub", href: repoUrl },
      { label: "Contributing", href: `${repoUrl}/blob/daddy/.github/CONTRIBUTING.md` },
      { label: "Security", href: `${repoUrl}/blob/daddy/.github/SECURITY.md` },
      { label: "License", href: `${repoUrl}/blob/daddy/LICENSE` },
    ],
  },
];
