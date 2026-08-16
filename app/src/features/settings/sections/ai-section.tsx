import {
  SettingsHeading,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsSection,
} from "./settings-shared";

export function AiSection() {
  return (
    <section aria-label="AI settings" className={settingsSection}>
      <SettingsHeading
        title="AI"
        detail="Configure providers and writing tools for this workspace."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Availability</div>
        <p className={settingsGroupHint}>
          AI is enabled. Provider and model controls will appear here when available.
        </p>
      </div>
    </section>
  );
}
