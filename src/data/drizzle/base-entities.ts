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

export const drizzleAdapterTargets = {
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

