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
    searchText: "artificial intelligence providers models writing tools prompts",
    icon: StarIcon,
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

export function availableSettingsSections(
  aiEnabled: boolean,
  browserRuntime: boolean,
): (typeof SECTIONS)[number][] {
  return SECTIONS.filter(
    (section) =>
      (section.id !== "ai" || aiEnabled) &&
      (section.id !== "media" || !browserRuntime),
  );
}
