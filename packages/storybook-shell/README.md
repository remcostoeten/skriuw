# @skriuw/storybook-shell

A dependency-free component catalog for React apps: searchable sidebar (`⌘K` / `Ctrl K` or `/`) that collapses to a rail (`⌘\` / `Ctrl \`), collapsible groups, theme picker, persisted preferences, and props tables parsed from component source.

## Copy into another project

From the project root, no Skriuw checkout needed (requires `bun`, `curl`, `tar`):

```bash
curl -fsSL https://raw.githubusercontent.com/remcostoeten/skriuw/daddy/packages/storybook-shell/install.sh | bash -s -- . [--dir src/storybook] [--force]
```

Pin a commit or tag with `STORYBOOK_SHELL_REF=<ref>` (default `daddy`); point at a fork with `STORYBOOK_SHELL_REPO=<owner/repo>`. From a local checkout, `bun packages/storybook-shell/install.ts <project-root>` does the same.

The installer writes `.storybook-shell.json` next to the copied files: the repo, ref and commit it came from, plus a hash of each file as installed. Rerunning keeps existing files. To pull a newer shell:

```bash
curl -fsSL https://raw.githubusercontent.com/remcostoeten/skriuw/daddy/packages/storybook-shell/install.sh | bash -s -- . --update
```

`--update` replaces every file that still matches its recorded hash and keeps the ones you edited, listing them as `edited`. `--force` overwrites those too. The starter `storybook-app.tsx` is never overwritten.

## Requirements

- React 19.
- Tailwind CSS v4. The shell uses the shadcn-style colors `background`, `foreground`, `muted`, `muted-foreground`, `border` and `ring`; when the app does not define them, the installer copies `tokens.css` (neutral light/dark defaults that still honour `--background` etc. if set) and prints the `@import` to add.
- A `@source` entry so Tailwind scans this package:

```css
@import "tailwindcss";
@source "../node_modules/@skriuw/storybook-shell";
```

## Usage

```tsx
import { Storybook, Variant, type Story } from "@skriuw/storybook-shell";
import buttonSource from "./ui/button.tsx?raw";

const stories: Story[] = [
  {
    id: "button",
    group: "Controls",
    title: "Button",
    description: "Primary actions.",
    api: [{ source: buttonSource, type: "ButtonProps" }],
    render: () => (
      <Variant label="Sizes">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
      </Variant>
    ),
  },
];

export function App() {
  return (
    <Storybook
      title="My App"
      stories={stories}
      themes={[
        { id: "dark", label: "Dark", colorScheme: "dark" },
        { id: "light", label: "Light", colorScheme: "light" },
      ]}
      toggles={[{ id: "sounds", label: "Sounds", defaultValue: false }]}
      wrapper={(children, preferences) => (
        <SoundProvider enabled={preferences.toggles.sounds}>{children}</SoundProvider>
      )}
    />
  );
}
```

`?raw` imports (for `api`, `usage` and `source`) and `import.meta.glob` below are Vite features. Under Next.js or webpack, pass the source strings another way (for example a raw-loader rule) or leave `api`/`source` out.

To collect stories from files instead of listing them, use Vite's `import.meta.glob`:

```ts
const modules = import.meta.glob<{ stories: Story[] }>("./**/*.stories.tsx", { eager: true });
const stories = Object.values(modules).flatMap((module) => module.stories);
```

## Themes and color mode

A theme is `{ id, label, colorScheme, tokens? }`. When `themes` cover both schemes, the top bar shows a light / dark / system button (following `prefers-color-scheme` live in system mode). The theme picker then lists only the themes of the active scheme and remembers one theme per scheme.

There are three ways to connect an app's own theme, from least to most setup:

```tsx
// 1. Tokens only: the shell writes them as CSS variables on <html>.
<Storybook
  themes={lightDarkThemes({
    light: { background: "#ffffff", foreground: "#0a0a0a", muted: "#f4f4f5", "muted-foreground": "#71717a", border: "#e4e4e7", ring: "#a1a1aa" },
    dark: { background: "#0a0a0a", foreground: "#fafafa", muted: "#27272a", "muted-foreground": "#a1a1aa", border: "#27272a", ring: "#52525b" },
  })}
/>

// 2. Existing CSS: select on what the shell sets on <html>.
//    [data-theme="nord"] { --background: … }   or   .dark { … } (shadcn / Tailwind `dark:`)
<Storybook themes={[
  { id: "paper", label: "Paper", colorScheme: "light" },
  { id: "nord", label: "Nord", colorScheme: "dark" },
  { id: "dracula", label: "Dracula", colorScheme: "dark" },
]} />

// 3. A runtime theme provider: read the preferences in `wrapper`.
<Storybook themes={themes} wrapper={(children, { theme }) => <ThemeProvider name={theme}>{children}</ThemeProvider>} />
```

`defaultColorMode` (`"system"`) sets the mode before the viewer picks one, `darkClass` (`"dark"`, or `false`) names the class toggled in the dark scheme, and `features.colorModeToggle: false` hides the button. From a story, `useUpdatePreferences()({ colorMode: "dark" })` or `({ theme: "nord" })` switches programmatically.

## What it writes to the document

| Preference | Effect |
| --- | --- |
| Theme | `<html data-theme="…" data-color-scheme="…" data-color-mode="…">`, `color-scheme`, the theme's `tokens` as inline custom properties, and `darkClass` in the dark scheme |
| Toggles | Only passed to `wrapper` and `usePreferences()` |

All preferences persist in `localStorage` under `storageKey` (default `storybook:<title>`).

## Typography

`typographyStories(spec, options?)` turns a spec into up to four stories (fonts, type scale, line heights, text styles); empty sections are skipped. Each entry is rendered with its `className`/`style`, and the font family, size, line height, weight and tracking shown beside it are read from the rendered element, so the catalog reflects the real CSS.

```tsx
import { typographyStories } from "@skriuw/storybook-shell";

const stories = [
  ...typographyStories({
    families: [
      { name: "Sans", className: "font-sans", weights: [400, 500, 700] },
      { name: "Mono", style: { fontFamily: "var(--font-mono)" } },
    ],
    sizes: [
      { name: "Caption", className: "text-xs", description: "Metadata" },
      { name: "Body", className: "text-sm" },
      { name: "Title", className: "text-2xl font-semibold tracking-tight" },
    ],
    lineHeights: [
      { name: "Tight", className: "leading-tight" },
      { name: "Relaxed", className: "leading-relaxed" },
    ],
    // Selectors like `.prose h1` need their ancestors: `wrap` supplies them, `as` picks the element.
    styles: [{ name: "Heading 1", as: "h1", wrap: (specimen) => <article className="prose">{specimen}</article> }],
    sample: "Pack my box with five dozen liquor jugs",
  }, { group: "Foundations" }),
];
```

Options: `group` (default `"Typography"`), `idPrefix` (default `"typography"`), and per-section `titles` / `descriptions`. The sections are also exported as components (`FontFamilies`, `TypeScale`, `LineHeights`, `TextStyles`) for custom stories.

## Keyboard

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl K`, `/` | Focus search |
| `⌘\` / `Ctrl \` | Collapse or expand the sidebar |
| `G` `T`, letters, `Enter` | Jump to a story; fuzzy, so `inlco` finds InlineConfirm |
| `?` | Show the shortcut list (also the `?` button in the top bar) |
| `G` `M` / `U` / `P` / `S` | Go to the story's main content, usage, props (API) or source |

## Configuration

Every prop except `title` and `stories` is optional.

| Prop | Purpose |
| --- | --- |
| `logo` | ReactNode shown next to the title and in the collapsed rail (default: first-letter badge) |
| `themes` | Theme entries; with both schemes present the color mode button appears. Omit to hide both |
| `defaultColorMode` | `"light"`, `"dark"` or `"system"` (default) until the viewer chooses |
| `darkClass` | Class toggled on `<html>` in the dark scheme (default `"dark"`); `false` to skip |
| `toggles` | Extra persisted switches, read from `preferences.toggles` |
| `actions` | Extra controls at the end of the top bar |
| `wrapper` | Wraps the shell with app providers; receives the preferences |
| `storageKey` | `localStorage` key (default `storybook:<title>`) |
| `defaultClosedGroups` | Sidebar groups that start closed |
| `labels` | Any interface text, for renaming or translation (`DEFAULT_LABELS` lists them) |
| `shortcuts` | `{ search, toggleSidebar, jump, goToMain, goToUsage, goToApi, goToSource, help }`; jump and go-to take two-key sequences like `"g t"` as combos like `"mod+k"` or `"/"`, or `false` to disable |
| `features` | Turn off `search`, `jump`, `sectionShortcuts`, `help`, `collapsibleSidebar`, `collapsibleGroups`, `breadcrumb`, `colorModeToggle`, `tableOfContents`, `usage`, `api` or `source` |
| `layout` | `sidebarWidth`, `railWidth`, `contentMaxWidth`, `insetPanel`, `tableOfContentsMinViewport`, `tableOfContentsMinEntries` |

```tsx
<Storybook
  title="Acme UI"
  stories={stories}
  logo={<AcmeMark className="size-5" />}
  labels={{ searchPlaceholder: "Zoeken", onThisPage: "Op deze pagina" }}
  shortcuts={{ search: ["mod+p"], toggleSidebar: false }}
  features={{ source: false }}
  layout={{ sidebarWidth: 260, insetPanel: false }}
/>
```

## API

- `Storybook` — the shell; see Configuration.
- `useStorybookConfig()` — the resolved labels, shortcuts, features and layout, for custom story chrome.
- `usePreferences()` / `useUpdatePreferences()` — read or change preferences from inside a story.
- `lightDarkThemes({ light, dark })` — two themes from two token maps.
- `Variant` — labelled row inside a story canvas; each becomes a table of contents entry.
- `CodeBlock` — highlighted, copyable code. Stories get "Usage" from `usage` and "Source" from `source` (or the files in `api`).
- `plainButton` — neutral button classes for story triggers.
- `typographyStories` / `FontFamilies` / `TypeScale` / `LineHeights` / `TextStyles` — typography specimens; see Typography.
- `PropsTables` / `parseProps` — props tables from `?raw` component source.
