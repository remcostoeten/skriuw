import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  NotesIcon,
  CalendarIcon,
  TodoIcon,
  GearIcon,
  FolderIcon,
  UIPlaygroundIcon,
  IconButton,
} from "@/shared/ui/icons";

import { Logo } from "@/components/logo";

export function LeftToolbar({ onSettingsClick }: { onSettingsClick?: () => void }) {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isOnNoteView = location.pathname.startsWith("/note/") || location.pathname === "/";
  const isOnUIPlayground = location.pathname === "/_ui-playground";
  const isOnArchive = location.pathname === "/archive";

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
          active={isOnArchive}
          variant="sidebar"
          onClick={() => {
            if (!isOnArchive) {
              navigate("/archive");
            }
          }}
        />
        <IconButton
          icon={<CalendarIcon />}
          tooltip="Calendar"
          active={false}
          variant="sidebar"
          onClick={() => handleNonExistentRoute("calendar")}
        />
        <IconButton
          icon={<TodoIcon />}
          tooltip="Checklist"
          active={false}
          variant="sidebar"
          onClick={() => handleNonExistentRoute("checklist")}
        />
        <IconButton
          icon={<UIPlaygroundIcon />}
          tooltip="UI Playground"
          active={isOnUIPlayground}
          variant="sidebar"
          onClick={() => {
            if (!isOnUIPlayground) {
              navigate("/_ui-playground");
            }
          }}
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

