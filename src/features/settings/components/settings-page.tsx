"use client";

import * as React from "react";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Database,
  FlaskConical,
  Palette,
  PenLine,
  Plug,
  Shield,
  Sparkles,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";

import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { usePreferencesStore } from "@/features/settings/store";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";

import { AccountSection } from "@/features/settings/sections/account-section";
import { AppearanceSection } from "@/features/settings/sections/appearance-section";
import { EditorSection } from "@/features/settings/sections/editor-section";
import { NotificationsSection } from "@/features/settings/sections/notifications-section";
import { DataSection } from "@/features/settings/sections/data-section";
import { IntegrationsSection } from "@/features/settings/sections/integrations-section";
import { SecuritySection } from "@/features/settings/sections/security-section";
import { AiSection } from "@/features/settings/sections/ai-section";
import { TagsSection } from "@/features/settings/sections/tags-section";
import { ExperimentalSection } from "@/features/settings/sections/experimental-section";
import { SettingsSidebar, type SettingsTabId } from "./settings-sidebar";

type SectionMeta = {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  description: string;
};

const SECTIONS: ReadonlyArray<SectionMeta> = [
  { id: "account", label: "Account", icon: User, description: "Profile and sign-in" },
  { id: "appearance", label: "Appearance", icon: Palette, description: "Theme and density" },
  { id: "editor", label: "Editor", icon: PenLine, description: "Writing experience" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Reminders and alerts" },
  { id: "data", label: "Data & sync", icon: Database, description: "Export and backup" },
  { id: "integrations", label: "Integrations", icon: Plug, description: "Third-party connections" },
  { id: "security", label: "Security", icon: Shield, description: "Password and sessions" },
  { id: "ai", label: "AI", icon: Sparkles, description: "Providers and keys" },
  { id: "tags", label: "Tags", icon: Tag, description: "Manage tags" },
  { id: "experimental", label: "Experimental", icon: FlaskConical, description: "Preview features" },
];

const TAB_IDS = SECTIONS.map((s) => s.id);

function isTabId(value: string | null): value is SettingsTabId {
  return !!value && (TAB_IDS as ReadonlyArray<string>).includes(value);
}

function getSection(id: SettingsTabId): SectionMeta {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

function renderSection(id: SettingsTabId) {
  switch (id) {
    case "account":
      return <AccountSection />;
    case "appearance":
      return <AppearanceSection />;
    case "editor":
      return <EditorSection />;
    case "notifications":
      return <NotificationsSection />;
    case "data":
      return <DataSection />;
    case "integrations":
      return <IntegrationsSection />;
    case "security":
      return <SecuritySection />;
    case "ai":
      return <AiSection />;
    case "tags":
      return <TagsSection />;
    case "experimental":
      return <ExperimentalSection />;
  }
}

export function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const initializePreferences = usePreferencesStore((state) => state.initialize);
  const logActivity = usePreferencesStore((state) => state.logActivity);

  const tabParam = searchParams.get("tab");
  const parsedTab: SettingsTabId | null = isTabId(tabParam) ? tabParam : null;
  const activeTab: SettingsTabId = parsedTab ?? "account";

  useEffect(() => {
    initializePreferences();
    logActivity("settings_opened");
  }, [initializePreferences, logActivity]);

  const setTab = (next: SettingsTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/app/settings?${params.toString()}`, { scroll: false });
  };

  const clearTab = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `/app/settings?${qs}` : "/app/settings", { scroll: false });
  };

  const goHome = () => {
    router.push("/app");
  };

  const content = useMemo(() => renderSection(activeTab), [activeTab]);

  if (isMobile) {
    const showDetail = parsedTab !== null;
    return (
      <LayoutContainer className="bg-background">
        <AnimatePresence initial={false} mode="popLayout">
          {!showDetail ? (
            <motion.div
              key="settings-list"
              initial={{ x: "-12%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-12%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <MobileSettingsList onSelect={setTab} onDone={goHome} />
            </motion.div>
          ) : (
            <motion.div
              key={`settings-detail-${activeTab}`}
              initial={{ x: "12%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "12%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <MobileSettingsDetail
                section={getSection(activeTab)}
                onBack={clearTab}
              >
                {content}
              </MobileSettingsDetail>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutContainer>
    );
  }

  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <IconRail
          onOpenSettings={() => router.replace("/app/settings", { scroll: false })}
        />

        <div className="shrink-0" style={{ width: 220 }}>
          <SettingsSidebar activeTab={activeTab} onSelectTab={setTab} />
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
            <div className="mx-auto w-full max-w-3xl">{content}</div>
          </div>
        </main>
      </div>
    </LayoutContainer>
  );
}

type MobileSettingsListProps = {
  onSelect: (id: SettingsTabId) => void;
  onDone: () => void;
};

function MobileSettingsList({ onSelect, onDone }: MobileSettingsListProps) {
  return (
    <>
      <header
        className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
      >
        <div className="flex h-12 items-center">
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-11 items-center gap-1 px-2 text-[15px] font-medium text-muted-foreground transition-colors active:text-foreground/60"
            aria-label="Back to app"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
            <span>Back</span>
          </button>
        </div>
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <div className="h-12 w-20" aria-hidden="true" />
      </header>

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
      >
        <ul role="list" className="divide-y divide-border border-b border-border">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => onSelect(section.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                    "min-h-[56px] touch-manipulation",
                    "active:bg-muted/70",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground/80">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-medium leading-tight text-foreground">
                      {section.label}
                    </span>
                    <span className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {section.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/60"
                    strokeWidth={1.6}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

type MobileSettingsDetailProps = {
  section: SectionMeta;
  onBack: () => void;
  children: React.ReactNode;
};

function MobileSettingsDetail({ section, onBack, children }: MobileSettingsDetailProps) {
  return (
    <>
      <header
        className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
      >
        <div className="flex h-12 items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center gap-1 px-2 text-[15px] font-medium text-muted-foreground transition-colors active:text-foreground/60"
            aria-label="Back to settings"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
            <span>Settings</span>
          </button>
        </div>
        <h1 className="truncate px-2 text-[17px] font-semibold tracking-tight text-foreground">
          {section.label}
        </h1>
        <div className="h-12 w-24" aria-hidden="true" />
      </header>

      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
      >
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>
    </>
  );
}
