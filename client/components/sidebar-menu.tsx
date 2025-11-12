import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogAside,
  DialogContentArea,
  DialogNavGroup,
  DialogSection,
  DialogSeparator,
} from "@/shared/ui/dialog-drawer";
import { Settings, Moon, Pencil, Hand } from "lucide-react";
import { useState } from "react";

type SidebarMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
};

export function SidebarMenu({ open, onOpenChange, title }: SidebarMenuProps) {
  const [activeItem, setActiveItem] = useState<string>("appearance");

  const appItems = [
    {
      id: "general",
      label: "General",
      icon: <Settings className="w-4 h-4" />,
      active: activeItem === "general",
      onClick: () => setActiveItem("general"),
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: <Moon className="w-4 h-4" />,
      active: activeItem === "appearance",
      onClick: () => setActiveItem("appearance"),
    },
    {
      id: "editor",
      label: "Editor",
      icon: <Pencil className="w-4 h-4" />,
      active: activeItem === "editor",
      onClick: () => setActiveItem("editor"),
    },
  ];

  const syncItems = [
    {
      id: "Skriuw",
      label: "Skriuw Sync",
      icon: <Hand className="w-4 h-4" />,
      active: activeItem === "Skriuw",
      onClick: () => setActiveItem("Skriuw"),
    },
  ];

  const getContent = () => {
    switch (activeItem) {
      case "appearance":
        return {
          title: "Appearance",
          heading: "Color scheme",
          description: "Change the color scheme of the app.",
        };
      case "general":
        return {
          title: "General",
          heading: "General settings",
          description: "Configure general application settings.",
        };
      case "editor":
        return {
          title: "Editor",
          heading: "Editor settings",
          description: "Customize your editor preferences.",
        };
      case "Skriuw":
        return {
          title: "Skriuw Sync",
          heading: "Skriuw synchronization",
          description: "Configure Skriuw feedback synchronization settings.",
        };
      default:
        return {
          title: title,
          heading: "Settings",
          description: "Configure your application settings.",
        };
    }
  };

  const content = getContent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose />

        <div className="flex flex-row flex-1 overflow-hidden gap-4">
          <DialogAside>
            <DialogSection label="App">
              <DialogNavGroup items={appItems} />
            </DialogSection>

            <DialogSeparator />

            <DialogSection label="Synchronization">
              <DialogNavGroup items={syncItems} />
            </DialogSection>
          </DialogAside>

          <DialogContentArea>
            <h2 className="text-2xl font-bold text-Skriuw-text">{content.title}</h2>
            <h3 className="text-lg font-semibold text-Skriuw-text mt-6">
              {content.heading}
            </h3>
            <p className="text-sm text-Skriuw-text/70 mt-2">
              {content.description}
            </p>
          </DialogContentArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

