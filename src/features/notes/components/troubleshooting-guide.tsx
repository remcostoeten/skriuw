"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Trash2,
  Settings,
  FileText,
  Database,
  Eye,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useSettingsStore } from "@/modules/settings";
import { Button } from "@/shared/ui/button-component";

type DiagnosticStatus = "pending" | "checking" | "pass" | "fail";

type DiagnosticResult = {
  id: string;
  name: string;
  status: DiagnosticStatus;
  message?: string;
};

type Section = {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
};

export function TroubleshootingGuide() {
  const { settings, initializeSettings } = useSettingsStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview"]));
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  function toggleSection(id: string) {
    setExpandedSections(function update(prev) {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async function runDiagnostics() {
    setIsRunningDiagnostics(true);
    const results: DiagnosticResult[] = [];

    setDiagnostics([{ id: "store", name: "Settings Store", status: "checking" }]);
    await delay(300);

    const storeCheck: DiagnosticResult = {
      id: "store",
      name: "Settings Store",
      status: settings ? "pass" : "fail",
      message: settings
        ? `Store initialized with userId: ${settings.userId.slice(0, 8)}...`
        : 'Settings store not initialized. Click "Reset Settings" to fix.',
    };

    results.push(storeCheck);
    setDiagnostics([...results]);

    await delay(300);
    setDiagnostics([...results, { id: "storage", name: "LocalStorage", status: "checking" }]);
    await delay(300);

    let storageCheck: DiagnosticResult;

    try {
      const stored = localStorage.getItem("haptic-settings");

      storageCheck = {
        id: "storage",
        name: "LocalStorage",
        status: stored ? "pass" : "fail",
        message: stored
          ? `Found persisted settings (${(stored.length / 1024).toFixed(2)} KB)`
          : "No persisted settings found. Settings will reset on refresh.",
      };
    } catch {
      storageCheck = {
        id: "storage",
        name: "LocalStorage",
        status: "fail",
        message: "LocalStorage is not accessible. Check browser permissions.",
      };
    }

    results.push(storageCheck);
    setDiagnostics([...results]);

    await delay(300);
    setDiagnostics([...results, { id: "template", name: "Template Style", status: "checking" }]);
    await delay(300);

    const templateCheck: DiagnosticResult = {
      id: "template",
      name: "Template Style",
      status: settings?.templateStyle ? "pass" : "fail",
      message: settings?.templateStyle
        ? `Current template: "${settings.templateStyle}"`
        : "No template style configured.",
    };

    results.push(templateCheck);
    setDiagnostics([...results]);

    await delay(300);
    setDiagnostics([...results, { id: "mode", name: "Editor Mode", status: "checking" }]);
    await delay(300);

    const modeCheck: DiagnosticResult = {
      id: "mode",
      name: "Editor Mode",
      status: "pass",
      message: `Default mode: ${settings?.defaultModeMarkdown ? "Markdown" : "Rich Text"}`,
    };

    results.push(modeCheck);
    setDiagnostics([...results]);

    setIsRunningDiagnostics(false);
  }

  function clearCache() {
    try {
      localStorage.removeItem("haptic-settings");
      localStorage.removeItem("haptic-notes");
      initializeSettings();
      alert("Cache cleared successfully. Settings have been reset to defaults.");
    } catch {
      alert("Failed to clear cache. Please try clearing browser data manually.");
    }
  }

  const sections: Section[] = [
    {
      id: "overview",
      title: "Issue Overview",
      icon: <AlertCircle className="w-4 h-4" />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            If your note settings (template style, default mode, placeholder text) are not being
            applied when creating new notes, this guide will help you identify and resolve the
            issue.
          </p>
          <div className="p-3 rounded-md bg-card border border-border">
            <p className="font-medium text-foreground mb-2">Common Symptoms:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>New notes use &quot;Simple&quot; template regardless of selection</li>
              <li>Editor mode resets to default after page refresh</li>
              <li>Template preview shows correct style but notes differ</li>
              <li>Settings appear to save but revert on next visit</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: "diagnostics",
      title: "Run Diagnostics",
      icon: <Settings className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run automated diagnostics to check your settings configuration.
          </p>
          <Button
            onClick={runDiagnostics}
            disabled={isRunningDiagnostics}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isRunningDiagnostics && "animate-spin")} />
            {isRunningDiagnostics ? "Running..." : "Run Diagnostics"}
          </Button>

          {diagnostics.length > 0 && (
            <div className="space-y-2 mt-4">
              {diagnostics.map(function renderDiag(d) {
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-md border",
                      d.status === "pass" && "bg-green-500/5 border-green-500/20",
                      d.status === "fail" && "bg-red-500/5 border-red-500/20",
                      d.status === "checking" && "bg-muted border-border",
                      d.status === "pending" && "bg-card border-border",
                    )}
                  >
                    {d.status === "checking" && (
                      <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    {d.status === "pass" && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    )}
                    {d.status === "fail" && (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      {d.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{d.message}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "causes",
      title: "Potential Causes",
      icon: <Database className="w-4 h-4" />,
      content: (
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-medium text-foreground">1. Settings Not Persisting</h4>
            <p className="text-muted-foreground">
              The settings store uses localStorage for persistence. If localStorage is disabled,
              full, or cleared, settings will reset to defaults.
            </p>
            <div className="p-2 rounded bg-muted text-xs font-mono">
              Storage key: &quot;haptic-settings&quot;
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground">2. Note Creation Not Using Settings</h4>
            <p className="text-muted-foreground">
              The note creation function may not be reading from the settings store. This is a code
              integration issue where{" "}
              <code className="px-1 py-0.5 rounded bg-muted">createFile()</code> needs to apply the
              selected template.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground">3. UI State Desync</h4>
            <p className="text-muted-foreground">
              The UI may show stale data if React state and the Zustand store become out of sync.
              This can happen with rapid changes or race conditions.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-foreground">4. Browser Cache Issues</h4>
            <p className="text-muted-foreground">
              Outdated cached JavaScript may contain old store logic that doesn&#39;t properly apply
              settings to new notes.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "verify",
      title: "Verify Settings",
      icon: <Eye className="w-4 h-4" />,
      content: (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Follow these steps to verify your current settings configuration:
          </p>

          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                1
              </span>
              <div>
                <p className="font-medium text-foreground">Open Settings Modal</p>
                <p className="text-muted-foreground text-xs">
                  Click the gear icon in the sidebar to open settings.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                2
              </span>
              <div>
                <p className="font-medium text-foreground">Check Current Values</p>
                <p className="text-muted-foreground text-xs">
                  Note your current selections for Template Style and Default Mode.
                </p>
                {settings && (
                  <div className="mt-2 p-2 rounded bg-muted text-xs">
                    <p>
                      Template: <strong>{settings.templateStyle}</strong>
                    </p>
                    <p>
                      Mode:{" "}
                      <strong>{settings.defaultModeMarkdown ? "Markdown" : "Rich Text"}</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                3
              </span>
              <div>
                <p className="font-medium text-foreground">Create a Test Note</p>
                <p className="text-muted-foreground text-xs">
                  Create a new note and check if it uses the expected template format.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                4
              </span>
              <div>
                <p className="font-medium text-foreground">Refresh and Recheck</p>
                <p className="text-muted-foreground text-xs">
                  Refresh the page and verify settings persisted correctly.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "reset",
      title: "Reset Settings",
      icon: <Trash2 className="w-4 h-4" />,
      content: (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            If diagnostics fail or settings are corrupted, reset to defaults:
          </p>

          <div className="p-3 rounded-md bg-card border border-border space-y-3">
            <p className="font-medium text-foreground">Option 1: Clear Application Cache</p>
            <p className="text-muted-foreground text-xs">
              This will reset all settings and note data to defaults.
            </p>
            <Button onClick={clearCache} variant="destructive" size="sm" className="gap-2">
              <Trash2 className="w-4 h-4" />
              Clear Cache & Reset
            </Button>
          </div>

          <div className="p-3 rounded-md bg-card border border-border space-y-2">
            <p className="font-medium text-foreground">Option 2: Manual Browser Clear</p>
            <ol className="list-decimal list-inside text-muted-foreground text-xs space-y-1">
              <li>Open browser Developer Tools (F12)</li>
              <li>Go to Application tab</li>
              <li>Select &quot;Local Storage&quot; in the sidebar</li>
              <li>Find and delete keys starting with &quot;haptic-&quot;</li>
              <li>Refresh the page</li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      id: "test",
      title: "Test Scenarios",
      icon: <FileText className="w-4 h-4" />,
      content: (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Perform these tests to confirm settings are working correctly:
          </p>

          <div className="space-y-3">
            <div className="p-3 rounded-md bg-card border border-border">
              <p className="font-medium text-foreground mb-2">Test 1: Template Switching</p>
              <ol className="list-decimal list-inside text-muted-foreground text-xs space-y-1">
                <li>Open Settings and select &quot;Journal&quot; template</li>
                <li>Create a new note</li>
                <li>Verify note contains mood and tags fields</li>
                <li>Switch to &quot;Notion Style&quot; template</li>
                <li>Create another note</li>
                <li>Verify note contains created/updated metadata</li>
              </ol>
            </div>

            <div className="p-3 rounded-md bg-card border border-border">
              <p className="font-medium text-foreground mb-2">Test 2: Persistence Check</p>
              <ol className="list-decimal list-inside text-muted-foreground text-xs space-y-1">
                <li>Change template to &quot;Simple&quot;</li>
                <li>Toggle editor mode to Rich Text</li>
                <li>Refresh the page (Ctrl+R / Cmd+R)</li>
                <li>Open Settings and verify values persisted</li>
              </ol>
            </div>

            <div className="p-3 rounded-md bg-card border border-border">
              <p className="font-medium text-foreground mb-2">Test 3: Incognito Mode</p>
              <ol className="list-decimal list-inside text-muted-foreground text-xs space-y-1">
                <li>Open app in incognito/private window</li>
                <li>Change some settings</li>
                <li>Close and reopen incognito window</li>
                <li>Settings should reset (expected behavior)</li>
              </ol>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Settings Troubleshooting Guide
        </h1>
        <p className="text-sm text-muted-foreground">
          Systematic protocol for diagnosing and resolving note settings issues.
        </p>
      </div>

      <div className="space-y-2">
        {sections.map(function renderSection(section) {
          return (
            <div key={section.id} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={function onClick() {
                  toggleSection(section.id);
                }}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors"
              >
                <span className="text-muted-foreground">{section.icon}</span>
                <span className="flex-1 font-medium text-sm text-foreground">{section.title}</span>
                {expandedSections.has(section.id) ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {expandedSections.has(section.id) && (
                <div className="px-3 pb-4 pt-1 border-t border-border">{section.content}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise(function resolveDelay(resolve) {
    setTimeout(resolve, ms);
  });
}
