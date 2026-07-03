# Settings — Data Reference for Redesign

## Layout

Desktop: sidebar nav (220px, sticky) + content panel. Mobile: two-screen drilldown (list → detail). Each tab = one section. Section = `SectionHeader` (title + description) → `GroupLabel` → `SettingsCard` containing `Row` components. Tabs hidden in desktop (Tauri) build: `account`, `security`.

Layout container uses `LayoutContainer` + `IconRail` on desktop. Page has a "Back" button in top-left and a `/` shortcut hint for keyboard-focus toggling between sidebar and panel.

---

## Sections

### Account

```
SectionHeader: {
  title:       "Account",
  description: "How you appear in Skriuw and where notes are tied.",
}

// Top card: Avatar preview (not a setting row)
AvatarPreviewCard: {
  type:   "Card" (rounded-lg border),
  layout: "flex row, avatar left, name+email right",
  avatar: {
    type:  "AvatarFace" (SVG generative avatar),
    size:  56,
    color: "<derived from user.id or stored preference>",
    fallback: "initials",
  },
  name:   "<user display name>",
  email:  "<user email>",
}

GroupLabel: "PROFILE"

SettingsCard [
  displayName: {
    type:        "Input(text) + Button",
    label:       "Display name",
    description: "Shown on shared notes and comments.",
    input:       { className: "w-52 h-8", value: "<user name>" },
    button:      { text: "Save", visibleWhen: "dirty", state: "idle" | "Saving…" },
    behavior:    "auto-saves on blur, Enter saves",
  },
  username: {
    type:        "Input(text) + availability indicator + Button",
    label:       "Username",
    description: "Used for collaboration invites. Letters, numbers, underscores, and dots only.",
    input:       { placeholder: "your-handle", maxLength: 30, className: "w-52 h-8 pr-6" },
    indicator:   { type: "icon", states: "✓ green" | "✗ red" | null },
    button:      { text: "Save", visibleWhen: "dirty and valid", disabledWhen: "unavailable" },
    behavior:    "400ms debounced availability check, auto-saves on blur",
  },
  email: {
    type:        "Input(text)",
    label:       "Email",
    description: "Used for sign-in and account recovery.",
    readOnly:    true,
    className:   "w-52 h-8 opacity-60 cursor-not-allowed",
    title:       "Email changes require re-authentication — contact support",
  },
]

GroupLabel: "SHARING"

SettingsCard [
  sharedNotes: {
    type:        "Button" (link to /app/shared),
    label:       "Shared notes",
    description: "Manage every public link and see view activity.",
    button:      { text: "Open overview", icon: Share2, variant: "outline", asChild: Link },
  },
]

GroupLabel: "DANGER ZONE"

SettingsCard [
  signOut: {
    type:        "Button",
    label:       "Sign out",
    description: "End your session on this device.",
    button:      { text: "Sign out" | "Signing out…", icon: LogOut, variant: "outline" },
  },
  deleteAccount: {
    type:        "Button + Dialog",
    label:       "Delete account",
    description: "Permanently remove your account and notes.",
    button:      { text: "Delete", className: "destructive styling" },
    dialog: {
      title:       "Delete account",
      description: "This will permanently remove your account, notes, and history. This cannot be undone.",
      confirmType: "type-phrase",
      phrase:      "delete my account",
      input:       { placeholder: "delete my account" },
      buttons:     ["Cancel" (variant:outline), "Delete account" (destructive, disabledUntil: phrase matches)],
    },
  },
]
```

---

### Appearance

```
SectionHeader: {
  title:       "Appearance",
  description: "Make Skriuw feel like yours. Changes apply across your account.",
}

GroupLabel: "THEME"

// Not a SettingsCard — uses settingsAnchorProps + grid layout
theme: {
  type:        "ButtonGrid" (grid-cols-3 gap-3),
  label:       "Theme",
  description: null,
  cards: [
    {
      id: "midnight",
      label: "Skriuw",
      swatch: { from: "hsl(2 0% 7%)", to: "hsl(0 0% 15%)" },
      // Each card: 80px gradient preview + label + checkmark when selected
    },
    {
      id: "graphite",
      label: "Graphite",
      swatch: { from: "hsl(220 6% 12%)", to: "hsl(220 6% 22%)" },
    },
    {
      id: "paper",
      label: "Paper",
      swatch: { from: "hsl(40 18% 96%)", to: "hsl(40 14% 88%)" },
    },
    {
      id: "monokai",
      label: "Monokai",
      swatch: { from: "hsl(70 8% 14%)", to: "hsl(54 100% 62%)" },
    },
  ],
  selectionIndicator: "Check icon + accent background",
}

GroupLabel: "INTERFACE"

SettingsCard [
  compactSidebar: {
    type:          "Switch",
    label:         "Compact sidebar",
    description:   "Tighter spacing in the file tree.",
    visualization: "<CompactSidebarDemo> (inline live preview)",
    focusId:       "compact-sidebar",
  },
  treeGuides: {
    type:          "Switch",
    label:         "File tree guide lines",
    description:   "Show nested ruler lines in the notes sidebar.",
    visualization: "<TreeGuidesDemo> (inline live preview)",
    focusId:       "tree-guides",
  },
  showLineNumbers: {
    type:          "Switch",
    label:         "Show line numbers",
    description:   "In the editor gutter.",
    visualization: "<LineNumbersDemo> (inline live preview)",
    focusId:       "line-numbers",
  },
  reduceMotion: {
    type:        "Switch",
    label:       "Reduce motion",
    description: "Minimize transitions and animations.",
    focusId:     "reduce-motion",
    // No visualization
  },
]
```

---

### Editor

```
SectionHeader: {
  title:       "Editor",
  description: "How writing in Skriuw should feel.",
}

GroupLabel: "TYPOGRAPHY"

// Custom card (not SettingsCard) — rounded-lg border border-border/60 bg-card/40 p-5
// Contains two settings stacked vertically with a border-t divider
TypographyCard [
  defaultFont: {
    type:         "EditorFontPicker",
    label:        "Default font",
    description:  "Choose a typeface for the rich text editor.",
    visualization: "<DefaultFontDemo> (renders sample text in selected font)",
    focusId:      "editor-font",
    layout:       "font groups (Sans / Serif / Mono) each in a grid-cols-2 sm:grid-cols-3, then a live preview card below",
    card:         {
      style:     "min-h-[5.5rem] rounded-lg border p-3",
      glyph:     "Ag rendered in the font's typeface at 1.75rem",
      label:     "font name (text-xs font-medium)",
      selected:  "border-foreground/60 bg-accent/40 + Check icon badge (top-right, filled circle)",
    },
    previewCard:  {
      title: "Preview · <font label>",
      sample: "The quick brown fox jumps over the lazy dog.",
      desc:   "Editor text uses this family for notes, titles, and body copy.",
    },
  },
  lineHeight: {
    type:          "ButtonGroup",
    label:         "Line height",
    description:   "Spacing between lines while you write.",
    visualization: "<LineHeightDemo> (renders sample text at selected line height)",
    focusId:       "line-height",
    buttonStyle:   "min-w-[7.5rem] border px-3 py-2.5 text-left text-xs font-medium, aria-pressed for selection",
    options:       [
      { id: "cozy",        label: "Cozy",        value: "1.45" },
      { id: "comfortable", label: "Comfortable", value: "1.7"  },
      { id: "relaxed",     label: "Relaxed",     value: "1.95" },
    ],
  },
]

GroupLabel: "BEHAVIOR"

SettingsCard [
  defaultToRawMdx: {
    type:          "Switch",
    label:         "Default to Raw MDX",
    description:   "New notes open in raw MDX mode.",
    visualization: "<RawMdxModeDemo> (live preview)",
    focusId:       "raw-mdx",
  },
  animatedNumbers: {
    type:          "Switch",
    label:         "Animated numbers",
    description:   "Animate changing counts in the inspector and status bar.",
    visualization: "<AnimatedNumberDemo> (live preview with animated counter)",
  },
  vimMode: {
    type:        "Switch",
    label:       "Vim mode",
    description: "Modal editing with Normal and Insert modes (h/j/k/l, w/b/e, dd, x, i/a/o, and more). Press Esc for Normal mode.",
    focusId:     "vim-mode",
  },
  openNotesInTabs: {
    type:        "Switch",
    label:       "Open notes in tabs",
    description: "Keep opened notes in a tab bar instead of replacing the current note.",
    focusId:     "open-in-tabs",
  },
  detectTagsInText: {
    type:        "Switch",
    label:       "Detect #tags in note text",
    description: "Turn #words written in plain text into workspace tags. Disable if your notes contain code comments or .env snippets — tags inserted via the # menu keep working either way.",
    focusId:     "detect-tags-in-text",
  },
]
```

---

### Shortcuts

```
SectionHeader: {
  title:       "Shortcuts",
  description: "Rebind keyboard shortcuts. Changes are saved to this device.",
}

// "Reset all to defaults" button — visible only when overrides exist, positioned top-right
resetAllButton: {
  type:        "Button",
  text:        "Reset all to defaults",
  icon:        RotateCcw,
  visibleWhen: "hasOverrides === true",
}

// Groups rendered dynamically from shortcut registry, each wrapped in GroupLabel + SettingsCard
shortcutGroups: [
  {
    groupLabel: "<GROUP NAME>",
    SettingsCard [
      perShortcut: {
        type:        "RecordButton" (press keys to capture) + "Reset" button per shortcut,
        label:       "<shortcut label from registry>",
        description: "<shortcut description from registry>",
        display:     "Formatted key combo (e.g. Ctrl+K)",
        recording:   "Press keys…" (listening for keydown),
        reset:       { icon: RotateCcw, visibleWhen: "overridden" },
      },
    ],
  },
]
```

---

### Data & Sync (Cloud)

```
SectionHeader: {
  title:       "Data & sync",
  description: "Your notes are yours. Export, import, or back them up anytime.",
}

SettingsCard [
  exportNotes: {
    type:        "Checkbox + Button",
    label:       "Export notes",
    description: "Download notes, folders, journal entries, tags, and optional version history as a Skriuw v3 ZIP.",
    checkbox:    { label: "Include version history", checked: true },
    button:      { text: "Export" | "Exporting…" | "Failed — retry", icon: Download, variant: "outline", disabledWhen: "pending or !connected" },
    guestGate:   "export",
  },
  importBackup: {
    type:        "FileInput + Button + Dialog",
    label:       "Import backup",
    description: "Import a Skriuw backup or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace.",
    button:      { text: "Import" | "Reading…", icon: Upload, variant: "outline", disabledWhen: "pending or importing" },
    accept:      ".zip,application/zip",
    dialog: {
      title:       "Import backup",
      description: "Review what will happen when importing <filename>.",
      // Two-column grid for selects
      sourceFormat: {
        type:    "Select",
        label:   "Source format",
        options: [
          "Auto-detect",
          "Skriuw backup",
          "Obsidian vault (best effort)",
          "Apple Notes HTML (best effort)",
          "Bear export (best effort)",
          "Notion export (best effort)",
          "Simplenote export (best effort)",
          "Markdown folder (best effort)",
        ],
      },
      importPolicy: {
        type:    "Select",
        label:   "Import policy",
        options: [
          "Merge (skip duplicates)",
          "Overwrite matches",
          "Duplicate matches",
          "Replace workspace",
        ],
      },
      // Shown only when policy === "replace-workspace"
      replaceConfirm: {
        type:  "Input",
        label: "To confirm workspace replace, type '<phrase>'",
        phrase: "replace my workspace",
      },
      preview: {
        type: "ImportPreviewSummary" (counts of notes/folders/journal to create/overwrite/skip + samples + warnings),
        states: ["previewing" (spinner), "ready" (summary), "importing" (progress bar), "success", "error"],
      },
      buttons: [
        "Cancel" (outline),
        {
          text:  "Import new items" | "Import with overwrite" | "Import as duplicates" | "Replace workspace",
          state: "idle" | "Importing…",
        },
      ],
    },
  },
]

GroupLabel: "DESKTOP APP"

// Custom layout (not standard Row) — SettingsCard with KeyRound icon, token name input, Create button, list of active tokens
desktopSyncTokens: {
  type:         "CustomCard",
  label:        "Desktop sync",
  description:  "Create a scoped token so the desktop app can pull your cloud workspace through /api/sync/export.",
  icon:         KeyRound,
  input:        { placeholder: "Desktop app", id: "desktop-sync-token-name", maxLength: 80 },
  button:       { text: "Create" | "Creating…", icon: Plus },
  // After creation: warning banner with full token + Copy button
  copyBanner: {
    type:        "WarningBanner",
    message:     "Copy this token now. It will not be shown again.",
    token:       "<full token>",
    button:      { text: "Copy" | "Copied", icon: Copy | Check },
  },
  activeTokens: {
    type:  "List",
    label: "Active tokens" header + "Refresh" button,
    emptyState: "No active desktop sync tokens yet.",
    items:  [
      {
        name:       "<token name>",
        prefix:     "<tokenPrefix>…",
        created:    "<date>",
        lastUsed:   "<date>",
        revokeBtn:  { text: "Revoke" | "Revoking…", icon: Trash2, variant: "destructive-outline" },
      },
    ],
  },
}

// Guest-only
resetDemoWorkspace: {
  type:        "Button",
  label:       "Reset demo workspace",
  description: "Clear your local demo edits and restore the original seeded workspace. This cannot be undone.",
  button:      { text: "Reset demo", icon: RotateCcw, variant: "outline" },
  visibleWhen: "guest user",
}

GroupLabel: "DANGER ZONE"

SettingsCard [
  clearAllData: {
    type:        "Button + Dialog",
    label:       "Clear all data",
    description: "Permanently delete all notes, folders, journal entries, and tags. Account and AI keys are kept.",
    button:      { text: "Clear data", icon: Trash2, variant: "destructive", disabledWhen: "!connected" },
    dialog: {
      title:       "Clear all data",
      description: "Permanently removes all notes, folders, journal entries, and tags. Your account and AI keys are kept. This cannot be undone.",
      confirmType: "type-phrase",
      phrase:      "clear my data",
      input:       { placeholder: "clear my data" },
      buttons:     ["Cancel" (outline), "Clear all data" (destructive, disabledUntil: phrase matches)],
    },
  },
]
```

---

### Data (Desktop / Tauri)

```
SectionHeader: {
  title:       "Data",
  description: "Your notes live as plain markdown on this device. Back them up, restore, or move the vault anytime.",
}

GroupLabel: "Vault"

SettingsCard [
  vaultDirectory: {
    type:     "Button",
    label:    "Vault directory",
    desc:     "<current vault root path>",
    buttons:  [
      { text: "Open", icon: FolderOpen, action: "reveal_in_finder" },
      { text: "Change…", action: "choose_vault_root" },
    ],
  },
]

GroupLabel: "Cloud sync"

SettingsCard [
  pullFromServer: {
    type:   "CustomCard" (with CloudDownload icon),
    title:  "Pull from server",
    description: "Download your cloud workspace into this device. Create a token in the web app under Settings → Data & sync, then paste it here. This is one-way: it never uploads local changes.",
    fields: [
      {
        label: "Server URL",
        type:  "Input(url)", placeholder: "https://your-skriuw-host.com",
      },
      {
        label: "Sync token",
        type:  "Input(password)", placeholder: "sk_sync_…",
      },
    ],
    button: "PullButton" — morphs between idle/pulling/success/error with animated label swap,
    resultPanel: "SyncResultPanel" — shows counts of notes/folders/journal/tags pulled with staggered animation,
    errorPanel:  "Alert" with AlertCircle icon,
  },
]

GroupLabel: "Backup"

SettingsCard [
  backupVault: {
    type:   "Button",
    label:  "Back up vault",
    desc:   "Save a .zip of every note and folder.",
    button: { text: "Back up" | "Backing up…", icon: Download },
  },
  restoreFromBackup: {
    type:   "Button",
    label:  "Restore from backup",
    desc:   "Replace the current vault with a .zip backup.",
    button: { text: "Restore" | "Restoring…", icon: Upload },
  },
  completeSnapshot: {
    type:         "Button pair",
    label:        "Complete snapshot",
    description:  "Capture settings, the SQLite index, the vault, and local AI data. Restoring wipes current desktop data and reloads Skriuw.",
    buttons: [
      { text: "Snapshot" | "Saving…", icon: Download },
      { text: "Restore snapshot" | "Restoring…", icon: Upload },
    ],
    progress: {
      type:    "ProgressBar" (status + count + percent + ETA),
      visible: "when busy",
    },
  },
]

GroupLabel: "Import"

SettingsCard [
  importSimplenote: {
    type:    "FileInput(.zip) + Button + Dialog",
    label:   "Import from Simplenote",
    desc:    "Pick your Simplenote export .zip. Notes, tags, and original dates are added to your vault; trashed notes go into a 'Trash' folder.",
    button:  { text: "Import" | "Importing…", icon: FileDown },
    dialog: {
      title:        "Import from Simplenote",
      preview:      "<count> notes found · <count> from Trash · <count> duplicates / unique",
      duplicateHandling: {
        type:    "Select",
        options: [
          "Do not import duplicates",
          "Overwrite existing notes",
          "Import duplicate copies",
        ],
      },
      aiTitlePass: {
        type:        "Switch" + Card,
        label:       "AI title pass",
        description: "After import, generate reviewable H1 titles for notes over 100 characters with multiple paragraphs.",
        // Post-import: progress bar, review list with toggle per suggestion
      },
    },
    postImportStates: {
      generating: "Progress bar — generating AI title suggestions",
      review:     "List of <title> / <original name> with Selected/Skipped toggle per item + Discard all / Apply N titles buttons",
    },
  },
]

GroupLabel: "Danger zone"

SettingsCard [
  resetApp: {
    type:   "Button + Dialog",
    label:  "Reset app",
    desc:   "Permanently remove app data, local AI data, and the vault.",
    button: { text: "Reset app" | "Resetting…", icon: RotateCcw, variant: "destructive" },
    dialog: {
      title:       "Reset Skriuw?",
      desc:        "This wipes the desktop app state, local AI data, and vault contents. Back up first if you want to keep anything.",
      confirmType: "type-phrase",
      phrase:      "reset skriuw",
      input:       { placeholder: "reset skriuw" },
      progress:    "ProgressBar with status + percent + ETA",
      buttons:     ["Cancel" (outline), "Reset app" (destructive, disabledUntil: phrase matches)],
    },
  },
]
```

---

### Privacy

```
SectionHeader: {
  title:       "Privacy",
  description: "Control what Skriuw sends outside your workspace.",
}

GroupLabel: "ANALYTICS"

SettingsCard [
  usageAnalytics: {
    type:        "Switch" (authenticated) | "Text: On" (guest),
    label:       "Usage analytics",
    description (authenticated): "Anonymous page views and product events while you browse. On by default for accounts — turn off to opt out. No note content, no cookies. Sign-in events are recorded separately on the server.",
    description (guest):         "Anonymous page views and product events are collected while you explore the demo. Create an account to manage analytics preferences.",
  },
]
```

---

### Security

```
SectionHeader: {
  title:       "Security",
  description: "Lock down access to your account.",
}

SettingsCard [
  changePassword: {
    type:   "Button + Dialog",
    label:  "Change password",
    desc:   "Update your sign-in password.",
    button: { text: "Update", variant: "outline" },
    dialog: {
      title:       "Change password",
      desc:        "Enter your current password, then choose a strong new password of at least 8 characters.",
      inputs: [
        { label: "Current password", type: "password", id: "current-password", autoComplete: "current-password" },
        { label: "New password",     type: "password", id: "new-password",     autoComplete: "new-password" },
        { label: "Confirm password", type: "password", id: "confirm-password", autoComplete: "new-password" },
      ],
      validation: "new === confirm && new >= 8 chars",
      buttons:    ["Cancel" (outline), "Save password" (disabledUntil: valid)],
    },
  },
]

GroupLabel: "CONNECTED ACCOUNTS"

SettingsCard [
  connectedAccounts: {
    type:   "ProviderList",
    items: [
      {
        provider: "Google",
        glyph:    "<Google SVG>",
        state:    "connected" | "not connected",
        button:   "Disconnect" (variant:outline) | "Connect",
        desc (connected):  "Connected. Used to sign in." | "Your only sign-in method — add a password or another provider first.",
        desc (disconnected): "Connect Google to sign in with one click.",
      },
      {
        provider: "GitHub",
        glyph:    "<Github SVG>",
        state:    "connected" | "not connected",
        button:   "Disconnect" | "Connect",
      },
    ],
    loadingState:  "Skeleton pulse per provider row",
    errorState:    "Error message + Retry button",
  },
]
```

---

### AI

```
SectionHeader: {
  title:       "AI",
  description: "Choose models, manage provider keys, and review recent activity.",
}

GroupLabel: "MODEL"

SettingsCard [
  preferredModel: {
    type:   "CustomSection" (with Label + description),
    label:  "Preferred model",
    desc:   "Applied to all AI actions — spell check, continue writing, title generation.",
    groups: [
      {
        provider: "Google",
        models: [
          { id: "google.gemini-2.5-flash-lite", label: "Flash Lite", desc: "Fastest · cheapest",             recommended: false },
          { id: "google.gemini-2.5-flash",       label: "Flash",      desc: "Best balance",                  recommended: true, badge: "rec" },
          { id: "google.gemini-2.5-pro",         label: "Pro",        desc: "Most capable",                  recommended: false },
        ],
      },
      {
        provider: "Groq",
        models: [
          { id: "groq.llama-3.3-70b-versatile",  label: "Llama 3.3 70B", desc: "Groq · fast inference", recommended: false },
          { id: "groq.llama-3.1-8b-instant",     label: "Llama 3.1 8B",  desc: "Groq · ultra fast",    recommended: false },
          { id: "groq.gemma2-9b-it",              label: "Gemma 2 9B",   desc: "Groq · lightweight",   recommended: false },
        ],
      },
    ],
    // Each model card: border button with label + desc + optional "rec" badge, selected state = ring + accent bg
  },
]

GroupLabel: "LOCAL KEYS"

SettingsCard [
  localKeys: {
    label:  "Local API keys",
    desc:   "Optional browser-stored keys for quick switching when a provider rate limits you.",
    addButton: { text: "Add key", icon: Plus, variant: "outline", toggles: form visibility },
    emptyState: "No local keys saved yet. The editor will use your saved provider keys, then the server deployment key when available.",
    addForm: {
      type: "CollapsibleForm",
      fields: [
        { type: "Input(text)",     placeholder: "Key name (e.g. Personal)" },
        { type: "Input(password)", placeholder: "API key...", showHideToggle: true },
      ],
      buttons: [
        { text: "Test",  action: "testKey",      disabledWhen: "empty or testing" },
        { text: "Save key", action: "addKey",     disabledWhen: "!tested || !name || !key" },
        { text: "Cancel",    action: "closeForm" },
      ],
      testResult: { type: "StatusLine" with icon (CheckCircle/XCircle/Loader) + status copy + details + diagnostic eventId },
    },
    keyList: [
      {
        name:      "<key name>",
        prefix:    "<first 8 chars>•••",
        isActive:  boolean,
        badge:     { text: "active", visibleWhen: "isActive" },
        testedIcon: { icon: CheckCircle, visibleWhen: "tested && !isActive" },
        buttons: [
          { icon: Star,   title: "Set as active key", visibleWhen: "!isActive" },
          { text: "Test", action: "testRowKey" },
          { icon: Trash2, action: "removeKey" },
        ],
        testResult: { type: "StatusLine" (same as above) },
      },
    ],
  },
]

GroupLabel: "PROVIDER KEYS"

// No SettingsCard wrapper — AiKeysManager is its own component (renders two cards stacked vertically)
providerKeysManager: [
  // Card 1: Server keys
  {
    type:   "CustomCard",
    label:  "Server keys",
    desc:   "User-owned provider keys stay encrypted server-side. Raw values are never shown after save.",
    icon:   KeyRound,
    providerToggle: {
      type:   "Button pair" (flex row, border, text-xs),
      options: ["Google", "Groq"],
    },
    addForm: {
      fields: [
        { type: "Input(text)",     placeholder: "Personal Gemini" | "Personal Groq", className: "h-10" },
        { type: "Input(password)", placeholder: "Google API key" | "Groq API key",   className: "h-10 font-mono" },
      ],
      layout: "grid gap-2 sm:grid-cols-[0.85fr_1.15fr]",
      button: { text: "Save key", icon: Plus | LoaderCircle },
      disabledWhen: "!label || !key || saving",
    },
    savedKeys: [
      {
        label:      "<key label>",
        provider:   "Google" | "Groq",
        keyPreview: "<masked preview>",
        lastTested: "<date>",
        status:     "StatusBadge" (success / valid / rate_limited / untested / error),
        statusStyle: {
          success/valid:  "border-success/25 bg-success/10 text-success + CheckCircle icon",
          rate_limited/untested: "border-warning/25 bg-warning/10 text-warning + CircleAlert icon",
          error:          "border-destructive/25 bg-destructive/10 text-destructive + CircleAlert icon",
        },
        buttons: [ "Rename" (prompt), "Test" (spinner when testing), "Delete" (icon) ],
      },
    ],
    emptyState: "No AI provider keys saved yet.",
    signOutState: "Sign in to manage encrypted provider keys and view activity.",
  },

  // Card 2: Activity log
  {
    type:   "CustomCard" (rounded-lg border border-border/60 bg-card/40),
    header: {
      title:      "Activity log",
      description:"Recent model calls, provider errors, and token usage.",
      eventCount: "<N> events · <N> errors (in red)" | null,
    },
    filters: {
      type:    "FilterButtons" (flex row, gap-1, border-y),
      options: ["All", "Errors (<count>)", "Success"],
      selectedStyle: "border-ring bg-accent",
    },
    list: {
      type:   "ExpandableList" (max-h-72 overflow-y-auto),
      items:  [
        {
          action:   "<human-readable action>",
          status:   "StatusBadge",
          provider: "<provider>",
          model:    "<model>",
          date:     "<formatted date>",
          expanded: {
            errorMessage:  "<error text>",
            resourceUrl:   "<link>",
            prompt:        "<truncated prompt>",
            inputTokens:   "<count>",
            outputTokens:  "<count>",
            totalTokens:   "<count>",
          },
        },
      ],
      emptyState: "No AI usage has been logged for this account yet." | "No errors/success in loaded history.",
    },
    loadMore: {
      type:   "Button",
      text:   "Load more" | spinner,
      action: "fetch next 20 rows",
      visibleWhen: "nextOffset !== null",
    },
  },
]
```

Note: In Tauri runtime, the entire AI section is replaced by `DesktopAiSection` (see below).

---

### Tags

```
// Entire section is custom HTML (no SectionHeader/SettingsCard/GroupLabel)
// Outer: TagsSection wraps TagManager

TagsSection: {
  layout: "space-y-4 custom divs",
  outerHeader: {
    title:  "Tags" (h3, text-sm font-medium),
    desc:   "Manage the tag vocabulary across notes and journal entries." (p, text-xs text-muted-foreground),
  },
  divider: "border-t border-border",

  // Inner component (dynamic import with skeleton loading)  
  TagManager: {
    header: {
      title:  "Manage Tags" (h3, text-sm font-medium),
      count:  "<N> tags created",
      button: { text: "New tag", icon: Plus, variant: "dashed-outline", visibleWhen: "!adding" },
    },

    addTagForm: {
      type: "CollapsibleForm" (border border-border bg-card p-3),
      visibleWhen: "adding",
      fields: [
        { type: "Input(text)", placeholder: "Tag name...", icon: Hash, autoFocus: true, behavior: "Enter submits, Escape cancels" },
        { type: "ColorPicker", label: "Color", colors: [
          "project-blue", "project-purple", "project-pink", "project-red",
          "project-orange", "project-amber", "project-green", "project-teal",
        ]},
        { type: "Preview", label: "Preview", visibleWhen: "name not empty", renders: "name in selected color with colored border+background" },
      ],
      buttons: [
        { text: "Cancel" },
        { text: "Create tag", disabledWhen: "!name.trim()" },
      ],
    },

    tagList: {
      type: "List",
      sortedBy: "usage count (descending)",
      emptyState: { icon: Hash, title: "No tags yet.", desc: "Create your first tag to organize notes and journal entries." },
      rowStyle: "flex items-center gap-3 border border-transparent px-2 py-2 hover:border-border hover:bg-muted",
      items: [
        {
          name:       "<tag name>",
          color:      "<tag color>",
          badgeStyle: "min-w-[60px] border px-2 py-0.5 text-xs font-medium (colored border + bg20 + text)",
          usageCount: "<N> uses",
          menu:       { type: "ContextMenu", icon: MoreHorizontal, items: ["Delete tag" (destructive styling)] },
          // Derived/optimistic tags can't be deleted — no menu shown
        },
      ],
    },
  },
}
```

---

### Experimental

```
// Entire section is custom HTML (no SectionHeader/SettingsCard/GroupLabel)
ExperimentalSection: {
  layout: "space-y-4 custom divs",
  header: {
    title:  "Experimental" (h3, text-sm font-medium),
    desc:   "Features still being shaped. Behavior may change." (p, text-xs text-muted-foreground),
  },
  divider: "border-t border-border",

  diaryView: {
    type:        "Switch" with Label (htmlFor: "diary-mode"),
    layout:      "flex items-center justify-between py-2",
    id:          "diary-mode",
    label:       "Diary view" (Label, text-sm font-medium),
    description: "Enable a layout optimized for chronological journaling." (p, text-xs text-muted-foreground pr-4),
  },

  extraNote: {
    type:  "p" (text-xs text-muted-foreground/70 italic),
    text:  "When enabled, new-note actions in Notes open today's journal entry instead of creating a markdown note.",
  },
}
```

---

## Desktop AI (Tauri)

Replaces the cloud AI section when running in the desktop app.

```
SectionHeader: {
  title:       "AI",
  description: "Run AI on this device with a local model, or connect a cloud provider. Keys stay on your machine.",
}

GroupLabel: "Provider"

SettingsCard [
  provider: {
    type:    "Select",
    label:   "AI provider",
    desc:    "Where title, spell-check, and continue-writing run.",
    options: [ "Ollama (local)", "Groq (cloud)", "Gemini (cloud)" ],
    triggerClassName: "w-44",
  },
]

// --- Shown when provider === "ollama" ---

GroupLabel: "Local engine"

SettingsCard [
  ollamaRuntime: {
    type:   "Row with state-dependent control",
    label:  "Ollama runtime",
    desc:   "Running · v<version>" | "Installed but not running" | "Not installed — one click downloads and starts it.",
    control: {
      notInstalled:  { button: "Install Ollama",  icon: Download },
      installed:     { button: "Start",            icon: Play },
      running:       { text: "Ready",              icon: Check (emerald) },
      installing:    { progress: "percent message + Cancel button" },
    },
    progressBar: { type: "ProgressBar", visibleWhen: "installing" },
  },
  activeModel: {
    type:    "Select",
    label:   "Active model",
    desc:    "The local model used for AI actions.",
    options: "<installed models>",
    triggerClassName: "w-48",
    visibleWhen: "installedModels.length > 0",
  },
]

GroupLabel: "Models"

SettingsCard [
  modelCatalog: {
    type: "List",
    items: [
      {
        label:        "<model label> · <model name>",
        description:  "Installed · <size>" | "<catalog description>",
        visualization: "ProgressBar (percent + status + ETA), visibleWhen: downloading",
        buttons: {
          installed:  { text: "Remove", icon: Trash2 },
          available:  { text: "Download", icon: Download, disabledWhen: "!ollama.running" },
          downloading: { text: "Cancel", icon: X },
        },
      },
    ],
    footerNote: "Start Ollama to download models.",
  },
]

// --- Shown when provider === "groq" or "gemini" ---

GroupLabel: "<Provider name>"

SettingsCard [
  model: {
    type:   "Input(text)",
    label:  "Model",
    desc:   "Groq model id (e.g. llama-3.3-70b-versatile)." | "Gemini model id (e.g. gemini-2.5-flash).",
    className: "w-56",
    behavior: "saves on blur",
  },
  apiKey: {
    type:   "Input(password) + Button",
    label:  "API key",
    desc:   "A key is saved on this device. Enter a new one to replace it, or save empty to clear." | "Stored locally in settings.json on this device.",
    input:  { className: "w-56", placeholder: "••••••••" | "Paste API key" },
    button: { text: "Save" },
  },
]
```

---

## Settings Tabs

Defined in `settings-page.tsx` SECTIONS array:

| ID | Label | Icon | Description | Desktop (Tauri) |
|---|---|---|---|---|
| account | Account | User | Profile and sign-in | hidden |
| appearance | Appearance | Palette | Theme and density | visible |
| editor | Editor | PenLine | Writing experience | visible |
| shortcuts | Shortcuts | Keyboard | Keyboard bindings | visible |
| data | Data & sync | Database | Export and backup | replaced by local Data |
| privacy | Privacy | Eye | Analytics and data use | visible |
| security | Security | Shield | Password and sessions | hidden |
| ai | AI | Sparkles | Providers and keys | replaced by DesktopAiSection |
| tags | Tags | Tag | Manage tags | visible |
| experimental | Experimental | FlaskConical | Preview features | visible |

Guest-gated tabs (show GuestSectionNotice instead of actual content): account, security, ai, tags.

---

## UI Primitives

```
SectionHeader: {
  props: { title: string, description: string },
  renders: "h1 (text-2xl font-semibold tracking-tight) + p (text-sm text-muted-foreground)",
  margin: "mb-8",
}

Row: {
  props: { title: string, description?: string, visualization?: ReactNode, children: ReactNode, disabled?: boolean, focusId?: string },
  layout: "flex items-start justify-between gap-6 py-4",
  left:  "title (text-sm font-medium) + optional description (text-xs text-muted-foreground) + optional visualization (mt-3)",
  right: "children (shrink-0)",
  focusId: "adds scroll-mt-24 + data-focus-id attribute for deep-linking",
  disabled: "opacity-50",
}

SettingsCard: {
  props: { children: ReactNode },
  renders: "rounded-lg border border-border/60 bg-card/40 px-5 divide-y divide-border/50",
}

GroupLabel: {
  props: { children: ReactNode },
  renders: "mb-2 mt-8 px-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground",
}
```

---

## Interaction Patterns

| Pattern | Usage |
|---|---|
| **Type-to-confirm** | All destructive actions (delete account, clear data, reset app) — user must type an exact phrase into a text input before the confirm button enables. |
| **Auto-save on blur** | Display name, username, model inputs (desktop AI) save when the field loses focus. |
| **Debounced validation** | Username availability checks fire 400ms after last keystroke, with inline ✓/✗ indicator. |
| **Live visualizations** | Many switches have inline demo components that toggle/show the effect in real time. |
| **Deep-link focus** | Focus IDs allow the command palette (Cmd+K) to jump directly to any named setting. |
| **Animated button states** | Pull button morphs between idle/pulling/success/error with blur-fade transitions. |
| **Recording mode** | Keyboard shortcut rows enter a capture mode that listens for keydown events (Esc to cancel). |
| **Guest gating** | Server-dependent tabs show a sign-up notice for guest (demo) users. |
| **Password show/hide** | API key inputs have an eye toggle to reveal the plaintext value. |
| **Progress bars** | Import, snapshot, reset, and model download operations show determinate progress with ETA. |

---

## Settings Store Types

```typescript
AppearancePreferences {
  theme:            ThemeId       // "midnight" | "graphite" | "paper" | "monokai"
  compactSidebar:   boolean       // default: false
  showLineNumbers:  boolean       // default: true
  reduceMotion:     boolean       // default: false
}

EditorPreferences {
  defaultModeRaw:      boolean      // default: false
  vimMode:             boolean      // default: false
  defaultFont:         EditorFontId // default: "inter"
  lineHeight:          EditorLineHeight // default: "comfortable"
  animateNumbers:      boolean      // default: true
  openNotesInTabs:     boolean      // default: false
  detectTagsInText:    boolean      // default: true
  notePropertiesLayout: "rows" | "inline"
  notePropertiesCollapsed: boolean
  notePropertiesDefaultTemplateId: string | null
  customNotePropertyTemplates: CustomNotePropertyTemplate[]
}

PrivacyPreferences {
  analyticsEnabled: boolean  // default: true
}

JournalPreferences {
  diaryModeEnabled: boolean  // default: false
  recentMoods: Array<{ mood: string; date: Date }>
}

AiPreferences {
  model:       string
  keys:        AiKey[]
  activeKeyId: string | null
}
```
