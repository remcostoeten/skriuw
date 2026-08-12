import { useEffect, useRef, useState } from "react";
import { openExternalUrl } from "@/bridge/commands";
import { cn } from "@/shared/lib/utils";
import {
  ABOUT_LINKS,
  checkForUpdate,
  describeUpdateOutcome,
  readAppVersion,
} from "@/features/settings/about-model";
import {
  SettingsHeading,
  settingsButton,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowDetail,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";

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
      <SettingsHeading
        title="About"
        detail="Version details, updates, and where to go for help."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Version</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Skriuw
            <span className={settingsRowDetail}>
              {version === null ? "Reading…" : `Version ${version}`}
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
            disabled={checking}
            onClick={runUpdateCheck}
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
        </div>
        {updateStatus && (
          <p className={cn(settingsRowDetail, "mt-2")} role="status">
            {updateStatus}
          </p>
        )}
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Links</div>
        <ul className="m-0 list-none p-0">
          {ABOUT_LINKS.map((link) => (
            <li key={link.id} className={settingsRow}>
              <span className={settingsRowLabel}>
                {link.label}
                <span className={settingsRowDescription}>{link.description}</span>
              </span>
              <button
                type="button"
                className={settingsButton}
                onClick={() => {
                  openExternalUrl(link.url).catch((error) => {
                    console.error("open external url rejected", error);
                  });
                }}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
