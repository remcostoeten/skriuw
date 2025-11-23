import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, numeric as pgNumeric, pgTable, text as pgText } from 'drizzle-orm/pg-core';

export const sqliteFeatures = sqliteTable('feature_definitions', {
  key: text('key').primaryKey(),
  description: text('description'),
  defaultValue: text('default_value').notNull(),
  valueType: text('value_type').notNull(),
});

export const sqliteEnvironmentDefaults = sqliteTable('feature_environment_defaults', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  environment: text('environment').notNull(),
  featureKey: text('feature_key').notNull(),
  value: text('value').notNull(),
});

export const sqliteRules = sqliteTable('feature_rules', {
  id: text('id').primaryKey(),
  environment: text('environment').notNull(),
  featureKey: text('feature_key').notNull(),
  value: text('value').notNull(),
  priority: integer('priority').default(0),
  percentage: real('percentage'),
  segmentId: text('segment_id'),
  conditions: text('conditions'),
});

export const sqliteSegments = sqliteTable('feature_segments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  conditions: text('conditions').notNull(),
});

export const sqliteUserOverrides = sqliteTable('feature_user_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identityKey: text('identity_key').notNull(),
  featureKey: text('feature_key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').default(Math.floor(Date.now() / 1000)),
});

export const sqliteEnvironmentVersions = sqliteTable('feature_environment_versions', {
  environment: text('environment').primaryKey(),
  version: integer('version').default(0).notNull(),
  updatedAt: integer('updated_at').default(Math.floor(Date.now() / 1000)),
});

export const pgFeatures = pgTable('feature_definitions', {
  key: pgText('key').primaryKey(),
  description: pgText('description'),
  defaultValue: pgText('default_value').notNull(),
  valueType: pgText('value_type').notNull(),
});

export const pgEnvironmentDefaults = pgTable('feature_environment_defaults', {
  id: pgInteger('id').generatedAlwaysAsIdentity(),
  environment: pgText('environment').notNull(),
  featureKey: pgText('feature_key').notNull(),
  value: pgText('value').notNull(),
});

export const pgRules = pgTable('feature_rules', {
  id: pgText('id').primaryKey(),
  environment: pgText('environment').notNull(),
  featureKey: pgText('feature_key').notNull(),
  value: pgText('value').notNull(),
  priority: pgInteger('priority').default(0),
  percentage: pgNumeric('percentage'),
  segmentId: pgText('segment_id'),
  conditions: pgText('conditions'),
});

export const pgSegments = pgTable('feature_segments', {
  id: pgText('id').primaryKey(),
  name: pgText('name').notNull(),
  description: pgText('description'),
  conditions: pgText('conditions').notNull(),
});

export const pgUserOverrides = pgTable('feature_user_overrides', {
  id: pgInteger('id').generatedAlwaysAsIdentity(),
  identityKey: pgText('identity_key').notNull(),
  featureKey: pgText('feature_key').notNull(),
  value: pgText('value').notNull(),
  updatedAt: pgInteger('updated_at').default(Math.floor(Date.now() / 1000)),
});

export const pgEnvironmentVersions = pgTable('feature_environment_versions', {
  environment: pgText('environment').primaryKey(),
  version: pgInteger('version').default(0).notNull(),
  updatedAt: pgInteger('updated_at').default(Math.floor(Date.now() / 1000)),
});
