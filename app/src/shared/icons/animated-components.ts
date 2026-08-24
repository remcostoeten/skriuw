import { CalendarDays, FolderOpen, Tags } from "./adapt-animateicons";
import { ChevronLeft } from "./animate-ui/icons/chevron-left";
import { ChevronRight } from "./animate-ui/icons/chevron-right";
import { PanelLeft } from "./animate-ui/icons/panel-left";
import { PanelRight } from "./animate-ui/icons/panel-right";
import { RotateCcw } from "./animate-ui/icons/rotate-ccw";
import { Settings } from "./animate-ui/icons/settings";
import { Trash2 } from "./animate-ui/icons/trash-2";
import { Users } from "./animate-ui/icons/users";

export const ANIMATED_ICONS = {
  notes: FolderOpen,
  journal: CalendarDays,
  tags: Tags,
  people: Users,
  trash: Trash2,
  settings: Settings,
  "previous-note": ChevronLeft,
  "next-note": ChevronRight,
  "version-history": RotateCcw,
  "toggle-sidebar": PanelLeft,
  "toggle-metadata": PanelRight,
} as const;
