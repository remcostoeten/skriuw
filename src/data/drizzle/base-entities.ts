import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
        id: text("id").primaryKey(),
        displayName: text("display_name").notNull(),
        email: text("email"),
        avatarUrl: text("avatar_url"),
        createdAt: integer("created_at", { mode: "number" }).notNull(),
        updatedAt: integer("updated_at", { mode: "number" }).notNull()
});

export const devices = sqliteTable("devices", {
        id: text("id").primaryKey(),
        profileId: text("profile_id")
                .notNull()
                .references(() => profiles.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        lastSeenAt: integer("last_seen_at", { mode: "number" }).notNull(),
        createdAt: integer("created_at", { mode: "number" }).notNull(),
        updatedAt: integer("updated_at", { mode: "number" }).notNull()
});

export const folders = sqliteTable("folders", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        parentFolderId: text("parent_folder_id").references(() => folders.id, {
                onDelete: "cascade"
        }),
        createdAt: integer("created_at", { mode: "number" }).notNull(),
        updatedAt: integer("updated_at", { mode: "number" }).notNull()
});

export const notes = sqliteTable("notes", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        content: text("content").notNull(),
        folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
        profileId: text("profile_id").references(() => profiles.id, { onDelete: "set null" }),
        createdAt: integer("created_at", { mode: "number" }).notNull(),
        updatedAt: integer("updated_at", { mode: "number" }).notNull()
});

export const revisions = sqliteTable("note_revisions", {
        id: text("id").primaryKey(),
        noteId: text("note_id")
                .notNull()
                .references(() => notes.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        snapshot: text("snapshot").notNull(),
        createdAt: integer("created_at", { mode: "number" }).notNull()
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

export type ProfileRow = typeof profiles.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
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

export const drizzleAdapterTargets = 
        web: {
                primary: 'drizzleLibsql' as const,
                fallback: 'localStorage' as const
        },
        desktop: {
                primary: 'drizzleLocalSqlite' as const,
                cloudReplica: 'drizzleLibsql' as const,
                fallback: 'localStorage' as const
        }
}

export type DrizzleAdapterTarget =
        | typeof drizzleAdapterTargets.web.primary
        | typeof drizzleAdapterTargets.web.fallback
        | typeof drizzleAdapterTargets.desktop.primary
        | typeof drizzleAdapterTargets.desktop.cloudReplica
