import { Settings, Moon, Pencil, Hand } from "lucide-react";
import { useState } from "react";

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
import { SettingsGroup } from "@/shared/ui/settings";

import { useSettings } from "@/features/settings";
import { EDITOR_SETTINGS_GROUPS } from "@/features/settings/editor-settings";

type props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
};

export function SidebarMenu({ open, onOpenChange, title }: props) {
  const [activeItem, setActiveItem] = useState<string>("appearance");
  const { settings, updateMultipleSettings } = useSettings();

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

  const handleSettingChange = (key: string, value: any) => {
    updateMultipleSettings({ [key]: value });
  };

  const renderSettingsContent = () => {
    const settingsGroup = EDITOR_SETTINGS_GROUPS.find(
      (group) => group.category === activeItem
    );

    if (settingsGroup) {
      return (
        <SettingsGroup
          group={settingsGroup}
          values={settings}
          onChange={handleSettingChange}
        />
      );
    }

    // Placeholder content for non-settings sections
    switch (activeItem) {
      case "general":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              General settings
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure general application settings.
            </p>
          </div>
        );
      case "Skriuw":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Skriuw synchronization
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure Skriuw feedback synchronization settings.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  const getContent = () => {
    switch (activeItem) {
      case "appearance":
        return {
          title: "Appearance",
        };
      case "general":
        return {
          title: "General",
        };
      case "editor":
        return {
          title: "Editor",
        };
      case "Skriuw":
        return {
          title: "Skriuw Sync",
        };
      default:
        return {
          title: title,
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
            <h2 className="text-2xl font-bold text-foreground mb-6">
              {content.title}
            </h2>
            <div className="overflow-y-auto">
              {renderSettingsContent()}
            </div>
          </DialogContentArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

