import {
  DatabaseIcon,
  FileTextIcon,
  ImageIcon,
  InfoIcon,
  KeyboardIcon,
  SettingsIcon,
  StarIcon,
  UserIcon,
} from "@/shared/icons/static";
import { SHORTCUT_DEFINITIONS } from "@/commands/definitions";

export const SECTIONS = [
  {
    id: "appearance",
    label: "General",
    description: "Appearance and workspace preferences",
    searchText:
      "appearance general color midnight paper embers mocha rose pine catppuccin gruvbox tokyo night compact sidebar tree guides indent reduce motion animated icons animation hover accessibility remember last note startup notifications toasts workspace reset preferences",
    icon: SettingsIcon,
  },
  {
    id: "editor",
    label: "Editor",
    description: "Writing experience",
    searchText:
      "font typography sans serif mono line spacing cozy comfortable relaxed empty note prompt placeholder writing",
    icon: FileTextIcon,
  },
  {
    id: "ai",
    label: "AI",
    description: "Providers and writing tools",
    searchText:
      "artificial intelligence providers models writing tools prompts default model switcher ollama gemini groq local remote playground prompt test stream",
    icon: StarIcon,
    desktopOnly: true,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard bindings",
    searchText: `keys hotkeys remap commands ${SHORTCUT_DEFINITIONS.map((definition) => `${definition.label} ${definition.group}`).join(" ")}`,
    icon: KeyboardIcon,
  },
  {
    id: "account",
    label: "Account & sync",
    description: "Cloud sign-in and workspace sync",
    searchText: "account cloud sign in sign up register email password session sync blocked changes recovery",
    icon: UserIcon,
  },
  {
    id: "media",
    label: "Media",
    description: "Images stored in this workspace",
    searchText:
      "media library images pictures photos png jpeg gif webp blobs attachments unused delete remove usage notes gallery",
    icon: ImageIcon,
    desktopOnly: true,
  },
  {
    id: "data",
    label: "Data & recovery",
    description: "Storage, imports, backups, and recovery",
    searchText:
      "database storage local file manager workspace path export import archive backup restore recovery rollback safety snapshot clear delete erase all data reset",
    icon: DatabaseIcon,
  },
  {
    id: "about",
    label: "About",
    description: "Version, updates, and links",
    searchText:
      "about version build update check for updates release changelog repository source github report issue bug feedback license help",
    icon: InfoIcon,
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export type SettingsSection = {
  id: SectionId;
  label: string;
  description: string;
  searchText: string;
  icon: (typeof SECTIONS)[number]["icon"];
  desktopOnly?: boolean;
};

/**
 * A section whose surface has no browser implementation. The flag lives on the
 * section itself so a runtime requirement is declared once, next to the rest of
 * the section's data, instead of as a condition callers have to remember.
 */
function isDesktopOnly(section: (typeof SECTIONS)[number]): boolean {
  return "desktopOnly" in section && section.desktopOnly;
}

/**
 * Sections visible for the current workspace, with the stored empty-note prompt
 * folded into the Editor haystack: `searchText` is static, so a prompt the user
 * typed themselves would otherwise be unreachable from the search field.
 */
export function availableSettingsSections(
  aiEnabled: boolean,
  browserRuntime: boolean,
  editorPlaceholder: string,
): SettingsSection[] {
  return SECTIONS.filter(
    (section) =>
      (section.id !== "ai" || aiEnabled) &&
      !(browserRuntime && isDesktopOnly(section)),
  ).map((section) =>
    section.id === "editor"
      ? { ...section, searchText: `${section.searchText} ${editorPlaceholder}` }
      : section,
  );
}
