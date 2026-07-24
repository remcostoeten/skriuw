import type { RendererStore } from "../../store/types";

export type SectionProps = {
  store: RendererStore;
};

type ToggleProps = {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SettingToggle({ label, detail, checked, onChange }: ToggleProps) {
  return (
    <label className="settings-row settings-toggle-row">
      <span className="settings-row-label">
        {label}
        <span className="settings-row-description">{detail}</span>
      </span>
      <input
        type="checkbox"
        className="settings-toggle-input"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
