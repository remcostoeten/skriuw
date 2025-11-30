import React from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui";
import { cn } from "@/shared/utilities";
import type { UserSetting } from "@/shared/data/types";

interface SettingSelectProps {
  setting: UserSetting<string | number>;
  value: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  className?: string;
}

export function SettingSelect({
  setting,
  value,
  onChange,
  disabled = false,
  className,
}: SettingSelectProps) {
  const handleChange = (newValue: string) => {
    // Convert back to the correct type based on setting options
    const convertedValue = setting.type === 'number' ? Number(newValue) : newValue;
    onChange(convertedValue);
  };

  const formatValue = (val: string | number): string => {
    if (setting.type === 'number') {
      return val.toString();
    }
    return val as string;
  };

  const formatDisplayValue = (val: string | number): string => {
    // Convert enum values to readable display names
    const displayMap: Record<string, string> = {
      'small': 'Small',
      'medium': 'Medium',
      'large': 'Large',
      'x-large': 'Extra Large',
      'inter': 'Inter',
      'mono': 'Monospace',
      'serif': 'Serif',
      'sans-serif': 'Sans Serif',
      'narrow': 'Narrow',
      'wide': 'Wide',
      'full': 'Full Width',
    };

    if (typeof val === 'string') {
      return displayMap[val] || val;
    }
    return val.toString();
  };

  return (
    <div className={cn("space-y-2 py-2", className)}>
      <Label
        htmlFor={setting.key}
        className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {setting.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
      </Label>
      <Select
        value={formatValue(value)}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger id={setting.key}>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {setting.options?.map((option) => (
            <SelectItem key={option} value={formatValue(option)}>
              {formatDisplayValue(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        {setting.description}
      </p>
      {setting.requiresRestart && (
        <p className="text-xs text-orange-600">
          Requires restart to take effect
        </p>
      )}
    </div>
  );
}
