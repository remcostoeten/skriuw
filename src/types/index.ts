// Core primitive types
export type EntityId = string; // UUID: string equivalent
export type Timestamp = number; // Epoch milliseconds (used throughout the app)

// Timestamp utility types
export type Timestamps = {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp; // Optional - only present when entity is deleted
};

// Position/ordering type
export type Positionable = {
  position: number; // Numeric positioning for ordering
};

// Base entity type (combines the requested types)
export type BaseEntity = Timestamps & Positionable & {
  id: EntityId;
};

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

// Entity base interface for consistent typing
export interface TimestampedEntity {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
}

export interface PositionedEntity {
  position: number;
}

export interface IdentifiableEntity {
  id: EntityId;
}

// Re-export for convenience
export type Children = React.ReactNode;