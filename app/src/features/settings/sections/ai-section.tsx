import {
  SettingsHeading,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsSection,
} from "./settings-shared";

type Props = {
  signal: AbortSignal;
};

export function AiSection({ signal }: Props) {
  signal.throwIfAborted();

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
