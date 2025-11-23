import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "ui";

import { SettingInput } from "./setting-input";
import { SettingSelect } from "./setting-select";
import { SettingSlider } from "./setting-slider";
import { SettingToggle } from "./setting-toggle";

import type { SettingsGroup , UserSetting } from "@/shared/data/types";

interface SettingsGroupProps {
  group: SettingsGroup;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
}

export function SettingsGroup({
  group,
  values,
  onChange,
  disabled = false,
}: SettingsGroupProps) {
  const renderSetting = (setting: UserSetting) => {
    const currentValue = values[setting.key] ?? setting.defaultValue;
    const handleChange = (value: any) => {
      onChange(setting.key, value);
    };

    switch (setting.type) {
      case 'boolean':
        return (
          <SettingToggle
            key={setting.key}
            setting={setting as UserSetting<boolean>}
            value={currentValue}
            onChange={handleChange}
            disabled={disabled}
          />
        );

      case 'enum':
        return (
          <SettingSelect
            key={setting.key}
            setting={setting as UserSetting<string | number>}
            value={currentValue}
            onChange={handleChange}
            disabled={disabled}
          />
        );

      case 'number':
        // Use slider for numeric settings that have reasonable ranges
        if (['fontSize', 'lineHeight', 'autoSaveInterval', 'tabSize'].includes(setting.key)) {
          return (
            <SettingSlider
              key={setting.key}
              setting={setting as UserSetting<number>}
              value={currentValue}
              onChange={handleChange}
              disabled={disabled}
            />
          );
        }
        // Fallthrough to string input for other numeric values

      case 'string':
        return (
          <SettingInput
            key={setting.key}
            setting={setting as UserSetting<string>}
            value={currentValue?.toString() || ''}
            onChange={handleChange}
            disabled={disabled}
          />
        );

      default:
        return (
          <div key={setting.key} className="text-sm text-muted-foreground">
            Unsupported setting type: {setting.type}
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{group.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {group.description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {group.settings.map(renderSetting)}
      </CardContent>
    </Card>
  );
}