import { relations } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
        id: text("id").primaryKey(),
        displayName: text("display_name").notNull(),
        email: text("email"),
        avatarUrl: text("avatar_url"),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

export const devices = pgTable("devices", {
        id: text("id").primaryKey(),
        profileId: text("profile_id")
                .notNull()
                .references(() => profiles.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        lastSeenAt: timestamp("last_seen_at", { mode: "date" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

export const folders = pgTable("folders", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        parentFolderId: text("parent_folder_id").references(() => folders.id, {
                onDelete: "cascade"
        }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

export const notes = pgTable("notes", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        content: jsonb("content").notNull(),
        folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
        profileId: text("profile_id").references(() => profiles.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

export const revisions = pgTable("note_revisions", {
        id: text("id").primaryKey(),
        noteId: text("note_id")
                .notNull()
                .references(() => notes.id, { onDelete: "cascade" }),
        label: text("label").notNull(),
        snapshot: jsonb("snapshot").notNull(),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
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

// Generic storage table for key-value pairs (settings, shortcuts, etc.)
export const genericStorage = pgTable("generic_storage", {
        key: text("key").primaryKey(),
        value: jsonb("value").notNull(),
        updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

export type ProfileRow = typeof profiles.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
/**
 * Base entity schema definitions for the Drizzle-backed storage layer.
 *
 * Now using Postgres as the single database backend.
 */
