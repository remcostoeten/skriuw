// Core primitive types (aliases to globally declared utilities)
export type UUID = globalThis.UUID;
export type ID = globalThis.ID;
export type Identifier = globalThis.Identifier;
export type EntityId = Identifier;
export type Timestamp = globalThis.Timestamp;

// Shared utility types
export type Nullable<T> = globalThis.Nullable<T>;
export type Optional<T> = globalThis.Optional<T>;
export type Positionable = globalThis.Positionable;
export type Timestamps<WithDeletedAt extends boolean = false> = globalThis.Timestamps<WithDeletedAt>;
export type BaseEntity<WithDeletedAt extends boolean = false> = globalThis.BaseEntity<WithDeletedAt>;

// Additional semantic types based on app structure
export type Order = number; // For explicit ordering semantics
export type Tag = string; // Consistent tag typing
export type Tags = Tag | Tag[]; // Flexible tag support

// Status/Priority enums for semantic clarity
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'med',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Project status enum
export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  COMPLETED = 'completed'
}

// Activity type enum
export enum ActivityType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  MOVE = 'move',
  COMPLETE = 'complete'
}

// Entity helper aliases for consistent typing
export type TimestampedEntity<WithDeletedAt extends boolean = false> = Timestamps<WithDeletedAt>;

export type PositionedEntity = Positionable;

export interface IdentifiableEntity {
  id: EntityId;
}

// Re-export for convenience
export type Children = globalThis.Children;