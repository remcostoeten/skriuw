import {
  BUILTIN_THEMES,
  THEME_TOKENS,
  TOKEN_NAMES,
  builtinThemeLabel,
  type ThemeName,
  type TokenName,
} from "@skriuw/theme";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  EDITOR_FONT_OPTIONS,
  EDITOR_LINE_HEIGHT_OPTIONS,
  THEME_OPTIONS,
  VIM_CURSOR_STYLE_OPTIONS,
} from "@/features/settings/settings-model";
import { usePreferences, useUpdatePreferences, type Story } from "@skriuw/storybook-shell";

const TOKEN_GROUPS: readonly { label: string; match: (token: TokenName) => boolean }[] = [
  { label: "Mood", match: (token) => token.startsWith("mood-") },
  { label: "Status", match: (token) => token.startsWith("status-") || token === "favorite" },
  { label: "Projects", match: (token) => token.startsWith("project-") },
  {
    label: "Editor",
    match: (token) =>
      token.startsWith("editor-") || token === "reference-tag" || token === "avatar-ink",
  },
  { label: "Sidebar", match: (token) => token.startsWith("sidebar-") },
  { label: "Surfaces", match: (token) => token.startsWith("theme-") },
  { label: "Core", match: () => true },
];

function groupTokens() {
  const remaining = new Set<TokenName>(TOKEN_NAMES);
  const groups = TOKEN_GROUPS.map((group) => {
    const tokens = [...remaining].filter(group.match);
    for (const token of tokens) remaining.delete(token);
    return { label: group.label, tokens };
  });
  return groups.reverse();
}

const GROUPED_TOKENS = groupTokens();

const OPTION_LISTS: Partial<Record<string, readonly { value: string; label: string }[]>> = {
  theme: THEME_OPTIONS,
  editorFont: EDITOR_FONT_OPTIONS,
  editorLineHeight: EDITOR_LINE_HEIGHT_OPTIONS,
  vimCursorStyle: VIM_CURSOR_STYLE_OPTIONS,
};

function ThemePreview({ id }: { id: ThemeName }) {
  const tokens = THEME_TOKENS[id];
  return (
    <div
      className="flex h-28 overflow-hidden rounded-md border"
      style={{ background: tokens.background, borderColor: tokens.border }}
    >
      <div
        className="flex w-1/3 flex-col gap-1.5 p-2"
        style={{ background: tokens["sidebar-background"] }}
      >
        <span
          className="h-1.5 w-3/4 rounded-full"
          style={{ background: tokens["sidebar-foreground"], opacity: 0.6 }}
        />
        <span
          className="h-1.5 w-full rounded-full"
          style={{ background: tokens["sidebar-accent"] }}
        />
        <span
          className="h-1.5 w-2/3 rounded-full"
          style={{ background: tokens["sidebar-foreground"], opacity: 0.35 }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="h-2 w-1/2 rounded-full" style={{ background: tokens.foreground }} />
        <span
          className="h-1.5 w-5/6 rounded-full"
          style={{ background: tokens["muted-foreground"] }}
        />
        <span
          className="h-1.5 w-2/3 rounded-full"
          style={{ background: tokens["muted-foreground"] }}
        />
        <span className="mt-auto flex gap-1">
          {(["primary", "success", "warning", "destructive", "info"] as const).map((token) => (
            <span
              key={token}
              className="size-2.5 rounded-full"
              style={{ background: tokens[token] }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function ThemeGallery() {
  const active = usePreferences().theme;
  const update = useUpdatePreferences();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
      {BUILTIN_THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          aria-pressed={theme.id === active}
          onClick={() => update({ theme: theme.id })}
          className="flex flex-col gap-2 rounded-lg border border-border/60 p-2 text-left hover:bg-muted/40 aria-pressed:border-ring aria-pressed:bg-muted/40"
        >
          <ThemePreview id={theme.id as ThemeName} />
          <span className="flex items-center justify-between px-1 text-[13px]">
            <span className="font-medium">{builtinThemeLabel(theme)}</span>
            <span className="text-[11px] text-muted-foreground">{theme.colorScheme}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TokenMatrix() {
  const active = usePreferences().theme;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 bg-background py-2 pr-4 text-left font-medium text-muted-foreground"
            >
              Token
            </th>
            <th scope="col" className="px-1 py-2 font-medium text-muted-foreground">
              Live
            </th>
            {BUILTIN_THEMES.map((theme) => (
              <th
                key={theme.id}
                scope="col"
                aria-current={theme.id === active ? "true" : undefined}
                className="px-1 py-2 font-medium text-muted-foreground aria-[current=true]:text-foreground"
              >
                {builtinThemeLabel(theme)}
              </th>
            ))}
          </tr>
        </thead>
        {GROUPED_TOKENS.map((group) => (
          <tbody key={group.label}>
            <tr>
              <th
                colSpan={BUILTIN_THEMES.length + 2}
                scope="colgroup"
                className="pb-1 pt-5 text-left text-[11px] font-medium text-muted-foreground"
              >
                {group.label}
              </th>
            </tr>
            {group.tokens.map((token) => (
              <tr key={token}>
                <th
                  scope="row"
                  className="sticky left-0 bg-background py-0.5 pr-4 text-left font-mono font-normal"
                >
                  --{token}
                </th>
                <td className="px-1 py-0.5" aria-label={`--${token}, current theme`}>
                  <span
                    className="mx-auto block h-5 w-10 rounded border border-border/60"
                    style={{ background: `hsl(var(--${token}))` }}
                  />
                </td>
                {BUILTIN_THEMES.map((theme) => {
                  const value = THEME_TOKENS[theme.id as ThemeName][token];
                  return (
                    <td
                      key={theme.id}
                      className="px-1 py-0.5"
                      aria-label={`--${token}, ${theme.id}: ${value}`}
                    >
                      <span
                        title={value}
                        className="mx-auto block h-5 w-10 rounded border border-border/60"
                        style={{ background: value }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function SettingsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[12px] text-muted-foreground">
          <tr className="border-b border-border/60">
            <th scope="col" className="py-2 pr-4 font-medium">
              Setting
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Default
            </th>
            <th scope="col" className="py-2 font-medium">
              Options
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(DEFAULT_WORKSPACE_SETTINGS).map(([key, value]) => (
            <tr key={key} className="border-b border-border/40">
              <th scope="row" className="py-2 pr-4 text-left font-mono text-[12px] font-normal">
                {key}
              </th>
              <td className="py-2 pr-4 font-mono text-[12px]">{JSON.stringify(value)}</td>
              <td className="py-2 text-muted-foreground">
                {OPTION_LISTS[key]?.map((option) => option.label).join(", ") ?? typeof value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const themeStories: Story[] = [
  {
    id: "themes",
    group: "Theme",
    title: "Themes",
    description:
      "Every built-in palette, previewed from its own tokens. Click one to apply it to the storybook.",
    render: () => <ThemeGallery />,
  },
  {
    id: "color-tokens",
    group: "Theme",
    title: "Color tokens",
    description: `All ${TOKEN_NAMES.length} theme tokens. "Live" follows the active theme; the other columns read each palette directly.`,
    render: () => <TokenMatrix />,
  },
  {
    id: "app-settings",
    group: "Theme",
    title: "App settings",
    description: "Workspace settings with their defaults and allowed values.",
    render: () => <SettingsTable />,
  },
];
