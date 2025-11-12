import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { Archive, Calendar, CheckSquare, Settings, FileText } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function IconButton({
  icon,
  tooltip,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${active
            ? "bg-Skriuw-border/30 text-Skriuw-text"
            : "hover:bg-Skriuw-darker focus:bg-Skriuw-darker active:bg-Skriuw-darker text-Skriuw-icon"
            }`}
          onClick={onClick}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function LeftToolbar() {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if we're on a note view (either /note/:id or / with readme note)
  const isOnNoteView = location.pathname.startsWith("/note/") || location.pathname === "/";

  return (
    <div className="w-12 h-full bg-Skriuw-darker border-r border-Skriuw-border flex flex-col justify-between items-center py-12 px-1.5">
      <div className="flex flex-col items-center gap-2">
        <IconButton
          icon={<FileText className="w-[18px] h-[18px]" />}
          tooltip="Notes"
          active={isOnNoteView}
          onClick={() => {
            // Navigate to home/notes view if not already there
            if (!isOnNoteView) {
              navigate("/");
            }
          }}
        />
        <IconButton
          icon={<Archive className="w-[18px] h-[18px]" />}
          tooltip="Archive"
          active={activeItem === "archive"}
          onClick={() => setActiveItem(activeItem === "archive" ? null : "archive")}
        />
        <IconButton
          icon={<Calendar className="w-[18px] h-[18px]" />}
          tooltip="Calendar"
          active={activeItem === "calendar"}
          onClick={() => setActiveItem(activeItem === "calendar" ? null : "calendar")}
        />
        <IconButton
          icon={<CheckSquare className="w-[18px] h-[18px]" />}
          tooltip="Checklist"
          active={activeItem === "checklist"}
          onClick={() => setActiveItem(activeItem === "checklist" ? null : "checklist")}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <IconButton
          icon={<Settings className="w-[18px] h-[18px]" />}
          tooltip="Settings"
          active={activeItem === "settings"}
          onClick={() => setActiveItem(activeItem === "settings" ? null : "settings")}
        />
      </div>
    </div>
  );
}
