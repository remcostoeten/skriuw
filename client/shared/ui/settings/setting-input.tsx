import React from "react";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { cn } from "@/shared/utilities";
import type { UserSetting } from "@/shared/data/types";

interface SettingInputProps {
  setting: UserSetting<string>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  type?: 'text' | 'email' | 'url' | 'password';
  placeholder?: string;
}

export function SettingInput({
  setting,
  value,
  onChange,
  disabled = false,
  className,
  type = "text",
  placeholder,
}: SettingInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn("space-y-2 py-2", className)}>
      <Label
        htmlFor={setting.key}
        className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {setting.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
      </Label>
      <Input
        id={setting.key}
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
      />
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