import React from "react";

import { cn } from "@/shared/utilities";

import { Label, Switch } from "ui";

import type { UserSetting } from "@/shared/data/types";
import { WordWrapExample } from "./setting-example";

interface SettingToggleProps {
  setting: UserSetting<boolean>;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function SettingToggle({
  setting,
  value,
  onChange,
  disabled = false,
  className,
}: SettingToggleProps) {
  const handleChange = (checked: boolean) => {
    onChange(checked);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between py-2">
        <div className="space-y-0.5">
          <Label
            htmlFor={setting.key}
            className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {setting.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
          </Label>
          <p className="text-sm text-muted-foreground">
            {setting.description}
          </p>
          {setting.implemented === false && (
            <p className="text-xs text-muted-foreground italic">
              Not yet implemented
            </p>
          )}
          {setting.requiresRestart && (
            <p className="text-xs text-orange-600">
              Requires restart to take effect
            </p>
          )}
        </div>
        <Switch
          id={setting.key}
          checked={value}
          onCheckedChange={handleChange}
          disabled={disabled}
        />
      </div>
      {/* Show example/preview for specific settings */}
      {setting.key === 'wordWrap' && (
        <WordWrapExample value={value} />
      )}
    </div>
  );
}
