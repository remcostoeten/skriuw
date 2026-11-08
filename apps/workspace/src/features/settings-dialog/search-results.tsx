import type { ReactNode } from "react";
import { cn } from "@/shared/styling/class-names";
import {
  settingsButton,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
} from "@/shared/ui/settings-controls";
import { SettingsLedgerContext } from "@/shared/ui/settings-ledger";
import type { SettingsLedger } from "@/shared/ui/settings-ledger";
import { ledgerSearchMatch, settingsSearchSnippet } from "./navigation";
import type { SettingsGroupHit, SettingsSectionHit } from "./navigation";
import type { SectionId, SettingsSection } from "./sections";

export type SettingsJump = {
  sectionId: SectionId;
  groupId?: string;
  rowLabel?: string;
};

const LIVE_RESULT_SECTIONS: ReadonlySet<SectionId> = new Set([
  "appearance",
  "editor",
  "shortcuts",
  "lock",
  "data",
  "about",
]);

const resultGroupClass =
  "grid grid-cols-[148px_minmax(0,1fr)] gap-x-6 border-t border-theme-divider/85 pt-4 pb-2 max-[620px]:grid-cols-1 max-[620px]:gap-y-2";

type Props = {
  query: string;
  hits: readonly SettingsSectionHit<SettingsSection>[];
  keywordOnly: readonly SettingsSection[];
  renderSection: (id: SectionId) => ReactNode;
  onJump: (jump: SettingsJump) => void;
};

export function SettingsSearchResults({ query, hits, keywordOnly, renderSection, onJump }: Props) {
  if (hits.length === 0 && keywordOnly.length === 0) {
    return (
      <p className="m-0 py-6 text-[13px] text-theme-secondary">
        No settings match “{query.trim()}”. Try a word from a label or description.
      </p>
    );
  }
  return (
    <div className="[&>*:first-child]:border-t-0 [&>*:first-child>section:first-child]:border-t-0">
      {hits.map((hit) =>
        LIVE_RESULT_SECTIONS.has(hit.section.id) ? (
          <LiveResults
            key={hit.section.id}
            section={hit.section}
            groups={hit.groups}
            query={query}
            renderSection={renderSection}
          />
        ) : (
          <IndexedResults
            key={hit.section.id}
            section={hit.section}
            groups={hit.groups}
            onJump={onJump}
          />
        ),
      )}
      {keywordOnly.map((section) => (
        <div key={section.id} data-results-section={section.id} className={resultGroupClass}>
          <h2 className="m-0 text-[13px] font-medium">{section.label}</h2>
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              {section.label}
              <span className={settingsRowDescription}>
                {settingsSearchSnippet(section, query) ?? section.description}
              </span>
            </span>
            <button
              type="button"
              className={settingsButton}
              onClick={() => onJump({ sectionId: section.id })}
            >
              Open
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type LiveProps = {
  section: SettingsSection;
  groups: readonly SettingsGroupHit[];
  query: string;
  renderSection: (id: SectionId) => ReactNode;
};

function LiveResults({ section, groups, query, renderSection }: LiveProps) {
  const ledger: SettingsLedger = {
    sectionId: section.id,
    sectionLabel: section.label,
    registry: null,
    query,
    search: ledgerSearchMatch(groups),
  };
  return (
    <div data-results-section={section.id} className="border-t border-theme-divider/85">
      <SettingsLedgerContext.Provider value={ledger}>
        {renderSection(section.id)}
      </SettingsLedgerContext.Provider>
    </div>
  );
}

type IndexedProps = {
  section: SettingsSection;
  groups: readonly SettingsGroupHit[];
  onJump: (jump: SettingsJump) => void;
};

function IndexedResults({ section, groups, onJump }: IndexedProps) {
  return (
    <div data-results-section={section.id}>
      {groups.map((group) => (
        <section
          key={group.id}
          className={resultGroupClass}
          aria-label={`${section.label}: ${group.title}`}
        >
          <h2 className="m-0 text-[13px] font-medium">
            <span className="block text-xs font-normal text-theme-secondary">{section.label}</span>
            {group.title}
          </h2>
          <div className="min-w-0">
            {group.rows.length === 0 ? (
              <ResultRow
                label={group.title}
                detail=""
                onShow={() => onJump({ sectionId: section.id, groupId: group.id })}
              />
            ) : (
              group.rows.map((row) => (
                <ResultRow
                  key={row.label}
                  label={row.label}
                  detail={row.detail}
                  onShow={() =>
                    onJump({ sectionId: section.id, groupId: group.id, rowLabel: row.label })
                  }
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

type ResultRowProps = {
  label: string;
  detail: string;
  onShow: () => void;
};

function ResultRow({ label, detail, onShow }: ResultRowProps) {
  return (
    <div className={settingsRow}>
      <span className={settingsRowLabel}>
        {label}
        {detail ? (
          <span className={cn(settingsRowDescription, "line-clamp-2")}>{detail}</span>
        ) : null}
      </span>
      <button type="button" className={settingsButton} onClick={onShow}>
        Show
      </button>
    </div>
  );
}
