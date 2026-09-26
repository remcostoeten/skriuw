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
    keeps: "Nothing read from Apple's database",
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
  { name: "Markdown", format: ".md folder", keeps: "Unknown syntax stays raw" },
  { name: "Plain text", format: ".txt", keeps: "One note per file" },
  { name: "ZIP", format: ".zip", keeps: "Scanned before a byte is written" },
];

export const bentoCards = [
  {
    keys: "⌘ /",
    hint: "toggle source",
    vignette: "editor" as const,
    title: "A rich editor that speaks Markdown",
    body: "Type `# `, `- `, or `**bold**` and it just works. Drop into raw Markdown whenever you want the source back.",
    span: "lg:col-span-8",
  },
  {
    keys: "d",
    hint: "go to date",
    vignette: "journal" as const,
    title: "A journal that remembers",
    body: "One entry per day with a mood, a calendar, and what you wrote a week, a month, and a year ago.",
    span: "lg:col-span-4",
  },
  {
    keys: "# $ @",
    hint: "reference anything",
    vignette: "links" as const,
    title: "Tags, people, and note links",
    body: "#tags, $people, and @note links resolve to real entities. Rename one and every reference follows.",
    span: "lg:col-span-4",
  },
  {
    keys: "auto",
    hint: "on every save",
    vignette: "history" as const,
    title: "Git history you never set up",
    body: "Every save is versioned in the background, off the editing path. Diff any revision, restore any version.",
    span: "lg:col-span-4",
  },
  {
    keys: "⌘ ⇧ L",
    hint: "lock folder",
    vignette: "lock" as const,
    title: "Locked notes and sealed sync",
    body: "Lock a note or a folder behind a PIN. Turn on sync and the server only ever holds bytes it cannot read.",
    span: "lg:col-span-4",
  },
  {
    keys: "⌘ K",
    hint: "command palette",
    vignette: "palette" as const,
    title: "Every action is one keystroke away",
    body: "Full-text search, tabs, split view, vim mode, and a rebindable shortcut for everything in the app.",
    span: "lg:col-span-12",
    wide: true,
  },
];

export const engineeringStats = [
  {
    icon: "bolt" as const,
    value: "8 ms",
    label:
      "from key press to letter on screen, 95 times out of 100. A screen refreshes every 16 ms, so you never see the wait.",
  },
  {
    icon: "activity" as const,
    value: "1,300+",
    label: "automated tests that run before anything ships",
  },
  {
    icon: "gauge" as const,
    value: "51",
    label: "design decisions written down, each with the trade-off it cost",
  },
];

export const themes = [
  {
    name: "Skriuw",
    bg: "#1d1b1b",
    ink: "#e8e4df",
    note: "the default, warm ink on near-black.",
  },
  {
    name: "Paper",
    bg: "#efe9df",
    ink: "#3a352e",
    note: "for daylight and long drafting sessions.",
  },
  {
    name: "Embers",
    bg: "#2a1a16",
    ink: "#e9a178",
    note: "low and warm, for writing after midnight.",
  },
  {
    name: "Catppuccin",
    bg: "#1e1e2e",
    ink: "#cba6f7",
    note: "Mocha, matching the rest of your setup.",
  },
  {
    name: "Rosé Pine",
    bg: "#191724",
    ink: "#ebbcba",
    note: "muted and soft on the eyes.",
  },
  {
    name: "Gruvbox",
    bg: "#282828",
    ink: "#fabd2f",
    note: "retro contrast, straight from your editor.",
  },
  {
    name: "Tokyo Night",
    bg: "#1a1b26",
    ink: "#7aa2f7",
    note: "cool blues, the terminal classic.",
  },
];

export const installChannels = [
  {
    name: "Browser",
    icon: "browser" as const,
    summary: "The same engine as the desktop app, running inside your tab.",
    hint: "No install, works offline after the first load",
    cta: "Open the app",
    href: appUrl,
    ctaVariant: "solid" as const,
    featured: true,
  },
  {
    name: "macOS",
    icon: "macos" as const,
    summary: "Universal build for Apple silicon and Intel, signed and notarized.",
    hint: "`brew install --cask skriuw/tap/skriuw`",
    cta: "Download for macOS",
    href: releasesUrl,
    ctaVariant: "outline" as const,
    featured: false,
  },
  {
    name: "Linux",
    icon: "linux" as const,
    summary: "Packaged the way you already install things.",
    hint: "Signed APT and RPM repos, AUR, AppImage",
    cta: "Download for Linux",
    href: releasesUrl,
    ctaVariant: "outline" as const,
    featured: false,
  },
  {
    name: "Windows",
    icon: "windows" as const,
    summary: "Installer or one Scoop command, on Windows 10 and 11.",
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
      { label: "Changelog", href: "/docs/changelog/" },
    ],
  },
  {
    title: "Engineering",
    links: [
      { label: "All documentation", href: "/docs/" },
      { label: "Architecture", href: "/docs/architecture/" },
      { label: "Performance contract", href: "/docs/performance-contract/" },
      { label: "Decision records", href: `${repoUrl}/tree/daddy/docs/adr` },
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
