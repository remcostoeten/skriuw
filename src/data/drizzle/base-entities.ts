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
