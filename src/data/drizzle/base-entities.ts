import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { baseEntitySchema } from "./schema-helpers";

import type { UUID, Time } from "@/shared/types/semantic";

export const profiles = sqliteTable("profiles", {
        ...baseEntitySchema(),
        displayName: text("display_name").notNull(),
        email: text("email"),
        avatarUrl: text("avatar_url")
});

export const devices = sqliteTable("devices", {
        ...baseEntitySchema(),
        profileId: text("profile_id")
                .notNull()
                .$type<UUID>()
                .references(() => profiles.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        lastSeenAt: integer("last_seen_at", { mode: "number" })
                .notNull()
                .$type<Time>()
});

export const folders = sqliteTable("folders", {
        ...baseEntitySchema(),
        name: text("name").notNull(),
        parentFolderId: text("parent_folder_id")
                .$type<UUID>()
                .references(() => folders.id, {
                        onDelete: "cascade"
                })
});

export const notes = sqliteTable("notes", {
        ...baseEntitySchema(),
        name: text("name").notNull(),
        content: text("content").notNull(),
        folderId: text("folder_id")
                .$type<UUID>()
                .references(() => folders.id, { onDelete: "set null" }),
        profileId: text("profile_id")
                .$type<UUID>()
                .references(() => profiles.id, { onDelete: "set null" })
});

export const revisions = sqliteTable("note_revisions", {
        id: text("id").primaryKey().$type<UUID>(),
        noteId: text("note_id")
                .notNull()
                .$type<UUID>()
                .references(() => notes.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        snapshot: text("snapshot").notNull(),
        createdAt: integer("created_at", { mode: "number" })
                .notNull()
                .$type<Time>()
});

export const folderRelations = relations(folders, ({ many, one }) => ({
        parent: one(folders, {
                fields: [folders.parentFolderId],
                references: [folders.id],
                relationName: "folderHierarchy"
        }),
        children: many(folders, { relationName: "folderHierarchy" }),
        notes: many(notes)
}));

export const noteRelations = relations(notes, ({ one, many }) => ({
        folder: one(folders, {
                fields: [notes.folderId],
                references: [folders.id]
        }),
        profile: one(profiles, {
                fields: [notes.profileId],
                references: [profiles.id]
        }),
        revisions: many(revisions)
}));

export const profileRelations = relations(profiles, ({ many }) => ({
        devices: many(devices),
        notes: many(notes)
}));

export const deviceRelations = relations(devices, ({ one }) => ({
        profile: one(profiles, {
                fields: [devices.profileId],
                references: [profiles.id]
        })
}));

export const revisionRelations = relations(revisions, ({ one }) => ({
        note: one(notes, {
                fields: [revisions.noteId],
                references: [notes.id]
        })
}));

// UI State Tables
export const uiState = sqliteTable("ui_state", {
        ...baseEntitySchema(),
        key: text("key").notNull().unique(), // e.g., 'expanded_folders', 'editor_tabs_state'
        value: text("value").notNull(), // JSON string
        profileId: text("profile_id")
                .$type<UUID>()
                .references(() => profiles.id, { onDelete: "cascade" })
});

export const appSettings = sqliteTable("app_settings", {
        ...baseEntitySchema(),
        key: text("key").notNull().unique(), // e.g., 'theme', 'fontSize', 'language'
        value: text("value").notNull(), // JSON string
        profileId: text("profile_id")
                .$type<UUID>()
                .references(() => profiles.id, { onDelete: "cascade" })
});

export const shortcuts = sqliteTable("shortcuts", {
        ...baseEntitySchema(),
        shortcutId: text("shortcut_id").notNull().unique(), // e.g., 'save', 'copy', 'paste'
        keyCombos: text("key_combos").notNull(), // JSON array of key combos
        profileId: text("profile_id")
                .$type<UUID>()
                .references(() => profiles.id, { onDelete: "cascade" })
});

// System/Metadata Tables
export const systemConfig = sqliteTable("system_config", {
        ...baseEntitySchema(),
        key: text("key").notNull().unique(), // e.g., 'storage_preference', 'schema_version'
        value: text("value").notNull(), // JSON string
        environment: text("environment").notNull().default("user") // 'system' | 'user'
});

export const eventLogs = sqliteTable("event_logs", {
        ...baseEntitySchema(),
        category: text("category").notNull(), // e.g., 'storage', 'user', 'system'
        level: text("level").notNull().default("info"), // 'debug' | 'info' | 'warn' | 'error'
        message: text("message").notNull(),
        metadata: text("metadata"), // JSON string with additional context
        timestamp: integer("timestamp", { mode: "number" }).notNull().$type<Time>()
});

export type ProfileRow = typeof profiles.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
export type UiStateRow = typeof uiState.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type ShortcutRow = typeof shortcuts.$inferSelect;
export type SystemConfigRow = typeof systemConfig.$inferSelect;
export type EventLogRow = typeof eventLogs.$inferSelect;
/**
 * Base entity schema definitions for the Drizzle-backed storage layer.
 *
 * These are framework-agnostic descriptions of the tables/columns we expect
 * to register when wiring Drizzle ORM for libsql/Tauri SQLite. By
 * keeping them library-free, the same shapes can be used to generate Drizzle
 * tables, seed data, migrations, and runtime validation without pulling
 * Drizzle into environments where it is not yet installed.
 */

export type SqlDialect = 'libsql' | 'sqlite'

export type ColumnType = 'text' | 'integer' | 'json' | 'boolean' | 'blob'

export interface ColumnDefinition {
        name: string
        type: ColumnType
        primaryKey?: boolean
        notNull?: boolean
        unique?: boolean
        default?: string | number | boolean | null
        references?: {
                table: string
                column: string
                onDelete?: 'cascade' | 'restrict' | 'set null'
        }
        /**
         * Optional check constraint for validating JSON payloads or enums.
         */
        check?: string
}

export interface IndexDefinition {
        name: string
        columns: string[]
        unique?: boolean
}

export interface TableDefinition {
        name: string
        dialects: SqlDialect[]
        columns: ColumnDefinition[]
        indexes?: IndexDefinition[]
        description?: string
}

const baseColumns: ColumnDefinition[] = [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'createdAt', type: 'integer', notNull: true },
        { name: 'updatedAt', type: 'integer', notNull: true },
        { name: 'version', type: 'integer', notNull: true, default: 1 }
]

const noteColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'title', type: 'text', notNull: true },
        { name: 'content', type: 'json', notNull: true },
        {
                name: 'folderId',
                type: 'text',
                references: { table: 'folders', column: 'id', onDelete: 'set null' }
        },
        {
                name: 'lastEditedBy',
                type: 'text',
                references: { table: 'profiles', column: 'id', onDelete: 'set null' }
        }
]

const folderColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'name', type: 'text', notNull: true },
        {
                name: 'parentId',
                type: 'text',
                references: { table: 'folders', column: 'id', onDelete: 'set null' }
        }
]

const noteRevisionColumns: ColumnDefinition[] = [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'noteId', type: 'text', notNull: true, references: { table: 'notes', column: 'id', onDelete: 'cascade' } },
        { name: 'snapshot', type: 'json', notNull: true },
        { name: 'createdAt', type: 'integer', notNull: true },
        { name: 'createdBy', type: 'text', references: { table: 'profiles', column: 'id', onDelete: 'set null' } }
]

const profileColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'displayName', type: 'text', notNull: true },
        { name: 'email', type: 'text', unique: true },
        { name: 'avatarUrl', type: 'text' }
]

const deviceReplicaColumns: ColumnDefinition[] = [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'device', type: 'text', notNull: true },
        { name: 'lastSyncedAt', type: 'integer', notNull: true, default: 0 },
        { name: 'clock', type: 'json', notNull: true, check: 'json_valid(clock)' }
]

const storageSyncColumns: ColumnDefinition[] = [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'entityId', type: 'text', notNull: true },
        { name: 'entityType', type: 'text', notNull: true },
        { name: 'op', type: 'text', notNull: true },
        { name: 'payload', type: 'json', notNull: true },
        { name: 'createdAt', type: 'integer', notNull: true },
        { name: 'appliedAt', type: 'integer' },
        { name: 'status', type: 'text', notNull: true, default: 'pending' }
]

const uiStateColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'key', type: 'text', notNull: true, unique: true },
        { name: 'value', type: 'json', notNull: true },
        {
                name: 'profileId',
                type: 'text',
                references: { table: 'profiles', column: 'id', onDelete: 'cascade' }
        }
]

const appSettingsColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'key', type: 'text', notNull: true, unique: true },
        { name: 'value', type: 'json', notNull: true },
        {
                name: 'profileId',
                type: 'text',
                references: { table: 'profiles', column: 'id', onDelete: 'cascade' }
        }
]

const shortcutsColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'shortcutId', type: 'text', notNull: true, unique: true },
        { name: 'keyCombos', type: 'json', notNull: true },
        {
                name: 'profileId',
                type: 'text',
                references: { table: 'profiles', column: 'id', onDelete: 'cascade' }
        }
]

const systemConfigColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'key', type: 'text', notNull: true, unique: true },
        { name: 'value', type: 'json', notNull: true },
        { name: 'environment', type: 'text', notNull: true, default: 'user' }
]

const eventLogsColumns: ColumnDefinition[] = [
        ...baseColumns,
        { name: 'category', type: 'text', notNull: true },
        { name: 'level', type: 'text', notNull: true, default: 'info' },
        { name: 'message', type: 'text', notNull: true },
        { name: 'metadata', type: 'json' },
        { name: 'timestamp', type: 'integer', notNull: true }
]

export const baseEntitySchemas: TableDefinition[] = [
        {
                name: 'notes',
                dialects: ['sqlite', 'libsql'],
                columns: noteColumns,
                indexes: [
                        { name: 'notes_folder_idx', columns: ['folderId'] },
                        { name: 'notes_updated_idx', columns: ['updatedAt'] }
                ],
                description: 'Primary note documents with block JSON content and parent folder linkage.'
        },
        {
                name: 'note_revisions',
                dialects: ['sqlite', 'libsql'],
                columns: noteRevisionColumns,
                indexes: [{ name: 'note_revisions_note_idx', columns: ['noteId'] }],
                description: 'Immutable snapshots for undo/redo, cross-device conflict resolution, and history.'
        },
        {
                name: 'folders',
                dialects: ['sqlite', 'libsql'],
                columns: folderColumns,
                indexes: [{ name: 'folders_parent_idx', columns: ['parentId'] }],
                description: 'Hierarchical folder tree supporting nested notebooks.'
        },
        {
                name: 'profiles',
                dialects: ['libsql'],
                columns: profileColumns,
                description: 'User profile metadata used for attribution and collaboration states.'
        },
        {
                name: 'ui_state',
                dialects: ['sqlite', 'libsql'],
                columns: uiStateColumns,
                indexes: [
                        { name: 'ui_state_key_idx', columns: ['key'] },
                        { name: 'ui_state_profile_idx', columns: ['profileId'] }
                ],
                description: 'UI state persistence for expanded folders, editor tabs, panel positions, etc.'
        },
        {
                name: 'app_settings',
                dialects: ['sqlite', 'libsql'],
                columns: appSettingsColumns,
                indexes: [
                        { name: 'app_settings_key_idx', columns: ['key'] },
                        { name: 'app_settings_profile_idx', columns: ['profileId'] }
                ],
                description: 'Application preferences and settings like theme, font size, language, etc.'
        },
        {
                name: 'shortcuts',
                dialects: ['sqlite', 'libsql'],
                columns: shortcutsColumns,
                indexes: [
                        { name: 'shortcuts_shortcut_idx', columns: ['shortcutId'] },
                        { name: 'shortcuts_profile_idx', columns: ['profileId'] }
                ],
                description: 'Custom keyboard shortcuts and key combinations for user actions.'
        },
        {
                name: 'system_config',
                dialects: ['sqlite', 'libsql'],
                columns: systemConfigColumns,
                indexes: [{ name: 'system_config_key_idx', columns: ['key'] }],
                description: 'System-level configuration like storage preferences, schema versions, etc.'
        },
        {
                name: 'event_logs',
                dialects: ['sqlite', 'libsql'],
                columns: eventLogsColumns,
                indexes: [
                        { name: 'event_logs_category_idx', columns: ['category'] },
                        { name: 'event_logs_timestamp_idx', columns: ['timestamp'] }
                ],
                description: 'Application event logging for debugging, analytics, and audit trails.'
        },
        {
                name: 'device_replicas',
                dialects: ['sqlite', 'libsql'],
                columns: deviceReplicaColumns,
                description: 'Tracks per-device logical clocks for sync/merge strategies in offline-first mode.'
        },
        {
                name: 'storage_queue',
                dialects: ['sqlite', 'libsql'],
                columns: storageSyncColumns,
                indexes: [
                        { name: 'storage_queue_status_idx', columns: ['status'] },
                        { name: 'storage_queue_entity_idx', columns: ['entityId'] }
                ],
                description: 'Outbox table for optimistic mutations that sync to cloud replicas.'
        }
]

export const drizzleAdapterTargets = {
        web: {
                primary: 'drizzleLibsqlHttp' as const,
                fallback: 'localStorage' as const
        },
        desktop: {
                primary: 'drizzleTauriSqlite' as const,
                cloudReplica: 'drizzleLibsqlHttp' as const,
                fallback: 'localStorage' as const
        }
} as const

export type DrizzleAdapterTarget =
        | typeof drizzleAdapterTargets.web.primary
        | typeof drizzleAdapterTargets.web.fallback
        | typeof drizzleAdapterTargets.desktop.primary
        | typeof drizzleAdapterTargets.desktop.cloudReplica
