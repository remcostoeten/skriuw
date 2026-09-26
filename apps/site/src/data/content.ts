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
  { label: "Download", href: "/download/", hint: "Builds for macOS, Windows, and Linux." },
];

export const importSources = [
  "Obsidian",
  "Notion",
  "Bear",
  "Apple Notes",
  "Simplenote",
  "Markdown",
  "Plain text",
  "ZIP",
];

export const tickerStats = [
  { label: "Letter appears in", value: "8 ms" },
  { label: "Disk reads when switching notes", value: "0" },
  { label: "Command palette opens in", value: "8 ms" },
  { label: "Scrolling 5,000 notes", value: "no stutter" },
  { label: "Account required", value: "none" },
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

export const platformStories = [
  {
    kicker: "Desktop",
    lead: "The full app,",
    brand: "offline",
    tail: "on macOS, Windows, and Linux. No account, no network, no sign-up wall.",
    stats: [
      { value: "One file", label: "Your whole workspace, on your disk, yours to copy or back up" },
      { value: "Rust", label: "Domain, storage, and history core" },
    ],
    tone: "dark" as const,
  },
  {
    kicker: "Browser",
    lead: "The same core, compiled to",
    brand: "WebAssembly",
    tail: "so you can try the real app at skriuw.com/app without installing anything.",
    stats: [
      { value: "0", label: "Bytes leave the tab until you sign in" },
      {
        value: "Offline",
        label: "Installs to your home screen and keeps working with no connection",
      },
    ],
    tone: "sage" as const,
  },
  {
    kicker: "Your data",
    lead: "Exportable to",
    brand: "plain Markdown",
    tail: "at any moment, plus versioned archives and verified six-hourly backups.",
    stats: [
      { value: "6 h", label: "Backup cadence, each one verified" },
      { value: "MIT", label: "Licensed, and the source is public" },
    ],
    tone: "plum" as const,
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
  { name: "Skriuw", bg: "#1d1b1b", ink: "#e8e4df", note: "the default, warm ink on near-black." },
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
  { name: "Rosé Pine", bg: "#191724", ink: "#ebbcba", note: "muted and soft on the eyes." },
  {
    name: "Gruvbox",
    bg: "#282828",
    ink: "#fabd2f",
    note: "retro contrast, straight from your editor.",
  },
  { name: "Tokyo Night", bg: "#1a1b26", ink: "#7aa2f7", note: "cool blues, the terminal classic." },
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
    hint: "`brew tap remcostoeten/skriuw`",
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

export const faqItems = [
  {
    question: "What is Skriuw?",
    answer:
      "Skriuw (Frisian for “to write”) is a local-first workspace for writing, journaling, and connected knowledge. Your notes live in a SQLite database on your own machine. It opens instantly, runs entirely offline, and works without an account.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. The desktop app and the browser build both run fully local with no sign-up. An account only exists so your workspace can sync between devices, and that is strictly opt-in. Turning it off is the default, not a setting you have to find.",
  },
  {
    question: "Where are my notes stored?",
    answer:
      "On the device you write on. The desktop app keeps one SQLite database on your disk, alongside a folder of images, a Git history, and your backups; Settings shows the exact path, opens it in your file manager, and can move the whole workspace elsewhere with a verified copy. The browser and mobile builds keep the same SQLite database in the app's own private storage on that device. Only if you opt into sync does a copy also sit in the cloud, end-to-end encrypted, so your other devices can pull it.",
  },
  {
    question: "Can I get my notes back out?",
    answer:
      "Any time, without asking us, from the desktop app or the browser build alike. Export a single note or the whole workspace as plain Markdown, or as a versioned JSON archive with golden-fixture tests guaranteeing old archives keep importing. Nothing you need is held only in the cloud, so there is no lock-in to escape.",
  },
  {
    question: "Can I import from Obsidian or Notion?",
    answer:
      "Yes: Obsidian, Notion, Bear, Simplenote, Apple Notes, and plain Markdown or text, from folders, single files, ZIPs, or .bear2bk backups. You see the format, destination, counts, and warnings in a preview before anything is written, and the import lands as one atomic commit.",
  },
  {
    question: "How is sync private if it is on a server?",
    answer:
      "Sync is end-to-end encrypted. A recovery code shown once derives the content key on your devices and is never sent anywhere; the server stores titles, bodies, tags, people, and media as opaque bytes. Lose the code and you lose only the cloud copy; the notes on your devices are untouched.",
  },
  {
    question: "What does it cost?",
    answer:
      "Nothing. Skriuw is free and MIT licensed, on every platform, with no paid tier, no seats, and no feature held back. The source is on GitHub if you would rather build it yourself.",
  },
  {
    question: "Is there an AI assistant in my notes?",
    answer:
      "Only if you turn one on. AI is invisible until explicitly enabled, and then it is local-first through Ollama or your own Gemini/Groq key. Output streams into a preview rather than into your note, so declining a suggestion leaves the document byte-for-byte unchanged.",
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
