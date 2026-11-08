import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useRef, useState } from "react";
import { openExternalUrl } from "@/platform/runtime/commands";
import {
  ABOUT_LINKS,
  checkForUpdate,
  describeUpdateOutcome,
  readAppVersion,
} from "@/features/settings-dialog/about/model";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsRowDetail,
  settingsSection,
} from "@/shared/ui/settings-controls";

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    readAppVersion().then((value) => {
      if (mountedRef.current) {
        setVersion(value);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function runUpdateCheck(): void {
    setChecking(true);
    setUpdateStatus(null);
    checkForUpdate()
      .then((outcome) => {
        if (mountedRef.current) {
          setUpdateStatus(describeUpdateOutcome(outcome));
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setChecking(false);
        }
      });
  }

  return (
    <section aria-label="About" className={settingsSection}>
      <SettingsGroup id="version" title="Version" keywords="build update release changelog">
        <SettingsRow
          label="Skriuw"
          detail={
            <span className={settingsRowDetail}>
              {version === null ? "Reading…" : `Version ${version}`}
            </span>
          }
          notes={
            updateStatus ? (
              <span className={settingsRowDetail} role="status">
                {updateStatus}
              </span>
            ) : null
          }
        >
          <button
            type="button"
            className={settingsButton}
            disabled={checking}
            onClick={runUpdateCheck}
          >
            {checking ? "Checking…" : settingsCopy.about.checkForUpdates}
          </button>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        id="links"
        title="Links"
        keywords="repository source github report issue bug feedback license help"
      >
        <ul className="m-0 list-none p-0">
          {ABOUT_LINKS.map((link) => (
            <SettingsRow key={link.id} as="li" label={link.label} detail={link.description}>
              <button
                type="button"
                className={settingsButton}
                onClick={() => {
                  openExternalUrl(link.url).catch((error) => {
                    console.error(settingsCopy.about.openExternalUrlRejected, error);
                  });
                }}
              >
                Open
              </button>
            </SettingsRow>
          ))}
        </ul>
      </SettingsGroup>
    </section>
  );
}
