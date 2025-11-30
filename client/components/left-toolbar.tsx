import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  NotesIcon,
  CalendarIcon,
  TodoIcon,
  GearIcon,
  FolderIcon,
  IconButton,
} from "@/shared/ui/icons";
import { Logo } from "@/components/logo";

export function LeftToolbar({ onSettingsClick }: { onSettingsClick?: () => void }) {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isOnNoteView = location.pathname.startsWith("/note/") || location.pathname === "/";

  return (
    <div className="w-12 h-full bg-sidebar-background border-r border-sidebar-border flex flex-col justify-between items-center px-1.5">
      <div className="flex flex-col items-center gap-2 pt-1.5">
        <div className="h-7 w-7 flex items-center justify-center">
          <Logo />
        </div>
        <IconButton
          icon={<NotesIcon />}
          tooltip="Notes"
          active={isOnNoteView}
          variant="sidebar"
          onClick={() => {
            if (!isOnNoteView) {
              navigate("/");
            }
          }}
        />
        <IconButton
          icon={<FolderIcon closedVariant />}
          hoverIcon={<FolderIcon />}
          tooltip="Archive"
          active={activeItem === "archive"}
          variant="sidebar"
          onClick={() => setActiveItem(activeItem === "archive" ? null : "archive")}
        />
        <IconButton
          icon={<CalendarIcon />}
          tooltip="Calendar"
          active={activeItem === "calendar"}
          variant="sidebar"
          onClick={() => setActiveItem(activeItem === "calendar" ? null : "calendar")}
        />
        <IconButton
          icon={<TodoIcon />}
          tooltip="Checklist"
          active={activeItem === "checklist"}
          variant="sidebar"
          onClick={() => setActiveItem(activeItem === "checklist" ? null : "checklist")}
        />
      </div>

      <div className="flex flex-col items-center gap-2 pb-12">
        <IconButton
          icon={<GearIcon />}
          tooltip="Settings"
          active={activeItem === "settings"}
          variant="sidebar"
          onClick={() => {
            setActiveItem(activeItem === "settings" ? null : "settings");
            onSettingsClick?.();
          }}
        />
      </div>
    </div>
  );
}

