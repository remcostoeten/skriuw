import React from "react";
import { Slider } from "@ui/slider";
import { Label } from "@ui/label";
import { cn } from "@/shared/utilities";
import type { UserSetting } from "@/shared/data/types";

interface SettingSliderProps {
  setting: UserSetting<number>;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
}

export function SettingSlider({
  setting,
  value,
  onChange,
  disabled = false,
  className,
  min = 0,
  max = 100,
  step = 1,
  formatValue = (val) => val.toString(),
}: SettingSliderProps) {
  const handleChange = (values: number[]) => {
    onChange(values[0]);
  };

  // Set reasonable defaults for common settings
  const getSliderProps = () => {
    switch (setting.key) {
      case 'fontSize':
        return { min: 12, max: 32, step: 2, formatValue: (val: number) => `${val}px` };
      case 'lineHeight':
        return { min: 1.0, max: 3.0, step: 0.1, formatValue: (val: number) => val.toFixed(1) };
      case 'autoSaveInterval':
        return { min: 5000, max: 300000, step: 5000, formatValue: (val: number) => `${val / 1000}s` };
      case 'tabSize':
        return { min: 2, max: 8, step: 2 };
      default:
        return { min, max, step, formatValue };
    }
  };

  const sliderProps = getSliderProps();

  return (
    <div className={cn("space-y-2 py-2", className)}>
      <div className="flex items-center justify-between">
        <Label
          htmlFor={setting.key}
          className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {setting.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
        </Label>
        <span className="text-sm font-mono text-muted-foreground min-w-[3rem] text-right">
          {sliderProps.formatValue(value)}
        </span>
      </div>
      <Slider
        id={setting.key}
        value={[value]}
        onValueChange={handleChange}
        min={sliderProps.min}
        max={sliderProps.max}
        step={sliderProps.step}
        disabled={disabled}
        className="w-full"
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