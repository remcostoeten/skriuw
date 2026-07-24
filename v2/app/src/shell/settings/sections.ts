import {
  DatabaseIcon,
  FileTextIcon,
  InfoIcon,
  KeyboardIcon,
  SettingsIcon,
} from "../../shared/icons";
import { SHORTCUT_DEFINITIONS } from "../../shortcuts/definitions";

export const SECTIONS = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and density",
    searchText:
      "color midnight paper embers mocha rose pine catppuccin gruvbox tokyo night compact sidebar tree guides indent reduce motion remember last note workspace",
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
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard bindings",
    searchText: `keys hotkeys remap commands ${SHORTCUT_DEFINITIONS.map((definition) => `${definition.label} ${definition.group}`).join(" ")}`,
    icon: KeyboardIcon,
  },
  {
    id: "data",
    label: "Data",
    description: "Storage, backups, and recovery",
    searchText:
      "database storage local file manager workspace path export import archive backup restore recovery rollback safety snapshot",
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
