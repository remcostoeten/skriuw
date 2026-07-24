import { useEffect, useRef, useState } from "react";
import { openExternalUrl } from "../../bridge/commands";
import {
  ABOUT_LINKS,
  checkForUpdate,
  describeUpdateOutcome,
  readAppVersion,
} from "../../settings/about-model";

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
    <section aria-label="About">
      <div className="settings-section-heading">
        <h1>About</h1>
        <p>Version details, updates, and where to go for help.</p>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Version</div>
        <div className="settings-row">
          <span className="settings-row-label">
            Skriuw
            <span className="settings-row-detail">
              {version === null ? "Reading…" : `Version ${version}`}
            </span>
          </span>
          <button
            type="button"
            className="settings-button"
            disabled={checking}
            onClick={runUpdateCheck}
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
        </div>
        {updateStatus && (
          <p className="settings-row-detail settings-about-update" role="status">
            {updateStatus}
          </p>
        )}
      </div>
      <div className="settings-group">
        <div className="settings-group-title">Links</div>
        <ul className="settings-about-links">
          {ABOUT_LINKS.map((link) => (
            <li key={link.id} className="settings-row">
              <span className="settings-row-label">
                {link.label}
                <span className="settings-row-description">{link.description}</span>
              </span>
              <button
                type="button"
                className="settings-button"
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
