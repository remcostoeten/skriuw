"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  Palette,
  Code,
  FlaskConical,
  Hash,
  Trash2,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/shared/ui/sidebar"
import { Switch } from "@/shared/ui/switch"
import { Label } from "@/shared/ui/label"
import { usePreferencesStore } from "@/features/settings/store"
import { useAuthSnapshot } from "@/platform/auth/use-auth"
import { signOut } from "@/platform/auth"


const TagManager = dynamic(
  () => import("./tag-manager").then((mod) => ({ default: mod.TagManager })),
  {
    ssr: false,
    loading: () => null,
  },
);

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="border-t border-border" />
      {children}
    </div>
  );
}

const data = {
  nav: [
    { id: "profile", name: "Profile", icon: Palette },
    { id: "editor", name: "Editor", icon: Code },
    { id: "tags", name: "Tags", icon: Hash },
    { id: "experimental", name: "Experimental", icon: FlaskConical },
  ],
}

const AVATAR_COLORS = [
  { label: "Auto", value: null },
  { label: "Rose", value: "#ec4899" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Orange", value: "#f97316" },
  { label: "Emerald", value: "#10b981" },
  { label: "Slate", value: "#64748b" },
  { label: "Violet", value: "#8b5cf6" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsModal({ open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = useState("editor");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deleteDescriptionId = React.useId();
  const deleteErrorId = React.useId();

  const {
    isLoading,
    editor,
    profile,
    journal,
    initialize: initializePreferences,
    updateEditorPreference,
    updateProfilePreference,
    toggleDiaryMode,
    logActivity,
  } = usePreferencesStore();

  const auth = useAuthSnapshot();
  const deleteVerifyString = auth.user
    ? `DELETE ${auth.user.email?.trim() ?? auth.user.id}`
    : "";
  const canDeleteAccount =
    Boolean(deleteVerifyString) &&
    deleteConfirmation === deleteVerifyString &&
    !isDeletingAccount;

  useEffect(() => {
    if (open) {
      initializePreferences();
      logActivity("settings_opened");
    } else {
      setDeleteConfirmation("");
      setDeleteError(null);
    }
  }, [open, initializePreferences, logActivity]);

  const handleDeleteAccount = async () => {
    if (!canDeleteAccount) return;

    setIsDeletingAccount(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not delete account.");
      }

      await signOut().catch(() => undefined);
      window.location.assign("/sign-in");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete account.");
      setIsDeletingAccount(false);
    }
  };

  const activeNavItem = data.nav.find(item => item.id === activeTab) || data.nav[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px] flex flex-col">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings here.
        </DialogDescription>
        
        {isLoading ? null : (
          <SidebarProvider className="items-start min-h-[480px]">
            <Sidebar collapsible="none" className="hidden md:flex">
              <SidebarContent>
                <div className="px-4 py-3">
                  <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                  {auth.user ? (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {auth.user.email}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Account required
                    </p>
                  )}
                </div>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {data.nav.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={activeTab === item.id}
                            onClick={() => setActiveTab(item.id)}
                          >
                            <item.icon />
                            <span>{item.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex h-[480px] flex-1 flex-col overflow-hidden">
              <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                <div className="flex items-center gap-2 px-4">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbLink className="cursor-pointer" onClick={() => setActiveTab("editor")}>Settings</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{activeNavItem.name}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-4 md:p-6 pb-12">
                
                {activeTab === "profile" && (
                  <SettingsSection title="Profile">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Avatar color</Label>
                        <p className="text-xs text-muted-foreground">
                          Choose a fixed accent color for your avatar, or keep it on automatic.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_COLORS.map((option) => {
                          const isActive = profile.avatarColor === option.value;

                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => updateProfilePreference("avatarColor", option.value)}
                              className="flex items-center gap-2 border border-border bg-background px-2.5 py-2 text-xs transition-colors hover:bg-muted"
                            >
                              <span
                                className="h-4 w-4 rounded-full border border-border"
                                style={{
                                  backgroundColor: option.value ?? "transparent",
                                  backgroundImage: option.value
                                    ? undefined
                                    : "linear-gradient(135deg, #ec4899, #3b82f6 55%, #10b981)",
                                }}
                              />
                              <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                                {option.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-8 border-t border-border pt-6">
                      <div className="space-y-4 border border-destructive/35 bg-destructive/[0.04] p-4">
                        <div className="flex items-start gap-3">
                          <Trash2
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                            strokeWidth={1.5}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="text-sm font-medium text-foreground">Delete account</h4>
                            <p
                              id={deleteDescriptionId}
                              className="text-xs leading-5 text-muted-foreground"
                            >
                              Permanently deletes your account and workspace data. Type{" "}
                              <code className="font-mono text-foreground">
                                {deleteVerifyString}
                              </code>{" "}
                              to confirm.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="delete-account-confirmation" className="sr-only">
                            Delete account confirmation
                          </Label>
                          <input
                            id="delete-account-confirmation"
                            value={deleteConfirmation}
                            onChange={(event) => setDeleteConfirmation(event.target.value)}
                            placeholder={deleteVerifyString}
                            autoComplete="off"
                            aria-describedby={
                              deleteError ? `${deleteDescriptionId} ${deleteErrorId}` : deleteDescriptionId
                            }
                            className="h-10 w-full border border-border bg-background px-3 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring"
                          />
                          {deleteError && (
                            <p id={deleteErrorId} role="alert" className="text-xs text-destructive">
                              {deleteError}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={!canDeleteAccount}
                          aria-describedby={deleteDescriptionId}
                          className="inline-flex h-9 w-fit items-center justify-center gap-2 border border-destructive/70 bg-destructive px-3 text-xs font-medium text-destructive-foreground outline-none transition-[background-color,border-color,transform,opacity] duration-150 ease-out hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                          {isDeletingAccount ? "Deleting..." : "Delete account"}
                        </button>
                      </div>
                    </div>
                  </SettingsSection>
                )}

                {activeTab === "editor" && (
                  <SettingsSection title="Editor Settings">
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-1">
                        <Label htmlFor="default-mode" className="text-sm font-medium">
                          Default to Raw MDX
                        </Label>
                        <p className="text-xs text-muted-foreground pr-4">
                          New notes will open in raw MDX mode instead of Block Note.
                        </p>
                      </div>
                      <Switch
                        id="default-mode"
                        checked={editor.defaultModeRaw}
                        onCheckedChange={(checked) =>
                          updateEditorPreference("defaultModeRaw", checked)
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground/70 italic">
                      Block Note remains the standard editing surface. This setting only affects the
                      default mode for new notes.
                    </p>
                  </SettingsSection>
                )}


                {activeTab === "tags" && (
                  <SettingsSection title="Tag Management">
                    <TagManager />
                  </SettingsSection>
                )}

                {activeTab === "experimental" && (
                  <SettingsSection title="Future Features">
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-1">
                        <Label htmlFor="diary-mode" className="text-sm font-medium">
                          Diary View
                        </Label>
                        <p className="text-xs text-muted-foreground pr-4">
                          Enable a layout optimized for chronological journaling.
                        </p>
                      </div>
                      <Switch
                        id="diary-mode"
                        checked={journal.diaryModeEnabled}
                        onCheckedChange={toggleDiaryMode}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground/70 italic">
                      When enabled, new-note actions in Notes open today's journal entry instead
                      of creating a markdown note.
                    </p>
                  </SettingsSection>
                )}

              </div>
            </main>
          </SidebarProvider>
        )}
      </DialogContent>
    </Dialog>
  )
}
