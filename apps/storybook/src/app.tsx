import type { ReactNode } from "react";
import {
  Storybook,
  type Story,
  type StorybookPreferences,
  type StorybookTheme,
  usePreferences,
  useUpdatePreferences,
} from "@skriuw/storybook-shell";
import { ThemeToggle } from "@skriuw/shared/components/theme-toggle";
import { BUILTIN_THEMES, builtinThemeLabel } from "@skriuw/theme";
import { AnimatedIconsProvider } from "@/shared/icons/animated-icons-context";
import { ToastHost } from "@/shared/ui/toast";
import { controlStories } from "./stories/controls";
import { feedbackStories } from "./stories/feedback";
import { iconStories } from "./stories/icons";
import { menuStories } from "./stories/menus";
import { overlayStories } from "./stories/overlays";
import { themeStories } from "./stories/theme";
import { fontStories } from "./stories/typography";

const STORIES: Story[] = [
  ...controlStories,
  ...feedbackStories,
  ...menuStories,
  ...overlayStories,
  ...iconStories,
  ...themeStories,
  ...fontStories,
];
const THEMES: StorybookTheme[] = BUILTIN_THEMES.map((theme) => ({
  id: theme.id,
  label: builtinThemeLabel(theme),
  colorScheme: theme.colorScheme,
}));
const TOGGLES = [{ id: "animatedIcons", label: "Animated icons", defaultValue: true }];

function wrapWithProviders(children: ReactNode, preferences: StorybookPreferences) {
  return (
    <AnimatedIconsProvider enabled={preferences.toggles.animatedIcons ?? true}>
      {children}
      <ToastHost />
    </AnimatedIconsProvider>
  );
}

const COLOR_MODES = ["light", "dark", "system"] as const;
const FEATURES = { colorModeToggle: false };

function ColorModeToggle() {
  const { colorMode } = usePreferences();
  const update = useUpdatePreferences();
  return (
    <ThemeToggle
      modes={COLOR_MODES}
      value={colorMode}
      onChange={(mode) => update({ colorMode: mode })}
      size="sm"
      aria-label="Color mode"
    />
  );
}

export function App() {
  return (
    <Storybook
      title="Skriuw Storybook"
      storageKey="skriuw-storybook:preferences"
      stories={STORIES}
      themes={THEMES}
      toggles={TOGGLES}
      wrapper={wrapWithProviders}
      features={FEATURES}
      actions={<ColorModeToggle />}
    />
  );
}
