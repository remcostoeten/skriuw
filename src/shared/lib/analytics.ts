"use client";

import { track, trackEvent, trackClick, trackError } from "@remcostoeten/analytics";

export const AnalyticsEvents = {
  NOTES: {
    CREATED: "note_created",
    DELETED: "note_deleted",
    UPDATED: "note_updated",
  },
  JOURNAL: {
    ENTRY_CREATED: "journal_entry_created",
    ENTRY_DELETED: "journal_entry_deleted",
    ENTRY_UPDATED: "journal_entry_updated",
    MOOD_LOGGED: "mood_logged",
    TAG_CREATED: "tag_created",
    TAG_DELETED: "tag_deleted",
  },
  EDITOR: {
    BLOCK_ADDED: "block_added",
    BLOCK_DELETED: "block_deleted",
    TEXT_TYPED: "text_typed",
  },
  SEARCH: {
    EXECUTED: "search_executed",
    RESULT_CLICKED: "search_result_clicked",
  },
  SYNC: {
    STARTED: "sync_started",
    COMPLETED: "sync_completed",
    FAILED: "sync_failed",
  },
  AUTH: {
    SIGNED_IN: "user_signed_in",
    SIGNED_UP: "user_signed_up",
    SIGNED_OUT: "user_signed_out",
    OAUTH_INITIATED: "oauth_initiated",
  },
  UI: {
    SIDEBAR_TOGGLED: "sidebar_toggled",
    THEME_CHANGED: "theme_changed",
    WORKSPACE_SWITCHED: "workspace_switched",
  },
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export function trackNoteCreated(noteId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.NOTES.CREATED, { noteId, ...metadata });
}

export function trackNoteDeleted(noteId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.NOTES.DELETED, { noteId, ...metadata });
}

export function trackNoteUpdated(noteId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.NOTES.UPDATED, { noteId, ...metadata });
}

export function trackJournalEntryCreated(entryId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.ENTRY_CREATED, { entryId, ...metadata });
}

export function trackJournalEntryDeleted(entryId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.ENTRY_DELETED, { entryId, ...metadata });
}

export function trackJournalEntryUpdated(entryId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.ENTRY_UPDATED, { entryId, ...metadata });
}

export function trackMoodLogged(entryId: string, mood: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.MOOD_LOGGED, { entryId, mood, ...metadata });
}

export function trackTagCreated(tagName: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.TAG_CREATED, { tagName, ...metadata });
}

export function trackTagDeleted(tagName: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.JOURNAL.TAG_DELETED, { tagName, ...metadata });
}

export function trackSearchExecuted(query: string, resultCount: number, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.SEARCH.EXECUTED, { query, resultCount, ...metadata });
}

export function trackSearchResultClicked(query: string, resultIndex: number, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.SEARCH.RESULT_CLICKED, { query, resultIndex, ...metadata });
}

export function trackSyncStarted(metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.SYNC.STARTED, metadata);
}

export function trackSyncCompleted(metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.SYNC.COMPLETED, metadata);
}

export function trackSyncFailed(error: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.SYNC.FAILED, { error, ...metadata });
}

export function trackUserSignedIn(method: "password" | "oauth", metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.AUTH.SIGNED_IN, { method, ...metadata });
}

export function trackUserSignedUp(method: "password" | "oauth", metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.AUTH.SIGNED_UP, { method, ...metadata });
}

export function trackUserSignedOut(metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.AUTH.SIGNED_OUT, metadata);
}

export function trackOAuthInitiated(provider: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.AUTH.OAUTH_INITIATED, { provider, ...metadata });
}

export function trackSidebarToggled(isOpen: boolean, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.UI.SIDEBAR_TOGGLED, { isOpen, ...metadata });
}

export function trackThemeChanged(theme: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.UI.THEME_CHANGED, { theme, ...metadata });
}

export function trackWorkspaceSwitched(workspaceId: string, metadata?: Record<string, unknown>) {
  trackEvent(AnalyticsEvents.UI.WORKSPACE_SWITCHED, { workspaceId, ...metadata });
}

export function trackUiClick(elementName: string, metadata?: Record<string, unknown>) {
  trackClick(elementName, metadata);
}

export { track, trackEvent, trackClick, trackError };