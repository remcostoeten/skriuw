import { eq } from 'drizzle-orm';
import type { FeatureDefinitionSet, FeatureSchema, FeatureValue, Rule, Segment, StorageProvider } from '../../core';
import {
  pgEnvironmentDefaults,
  pgEnvironmentVersions,
  pgFeatures,
  pgRules,
  pgSegments,
  pgUserOverrides,
  sqliteEnvironmentDefaults,
  sqliteEnvironmentVersions,
  sqliteFeatures,
  sqliteRules,
  sqliteSegments,
  sqliteUserOverrides,
} from './schema';

export type DrizzleDialect = 'sqlite' | 'postgres';

interface DrizzleTables {
  features: typeof sqliteFeatures | typeof pgFeatures;
  environmentDefaults: typeof sqliteEnvironmentDefaults | typeof pgEnvironmentDefaults;
  rules: typeof sqliteRules | typeof pgRules;
  segments: typeof sqliteSegments | typeof pgSegments;
  userOverrides: typeof sqliteUserOverrides | typeof pgUserOverrides;
  versions: typeof sqliteEnvironmentVersions | typeof pgEnvironmentVersions;
}

function selectTables(dialect: DrizzleDialect): DrizzleTables {
  return dialect === 'postgres'
    ? {
        features: pgFeatures,
        environmentDefaults: pgEnvironmentDefaults,
        rules: pgRules,
        segments: pgSegments,
        userOverrides: pgUserOverrides,
        versions: pgEnvironmentVersions,
      }
    : {
        features: sqliteFeatures,
        environmentDefaults: sqliteEnvironmentDefaults,
        rules: sqliteRules,
        segments: sqliteSegments,
        userOverrides: sqliteUserOverrides,
        versions: sqliteEnvironmentVersions,
      };
}

function parseValue(raw: string, typeHint?: string): FeatureValue {
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number' || typeof parsed === 'string' || typeof parsed === 'boolean' || parsed === null) {
      return parsed;
    }
  } catch (error) {
    if (typeHint === 'number') {
      const numberValue = Number(raw);
      if (!Number.isNaN(numberValue)) {
        return numberValue;
      }
    }
  }
  return raw;
}

function serializeValue(value: FeatureValue): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export interface DrizzleFeatureStoreOptions {
  dialect: DrizzleDialect;
}

export class DrizzleFeatureStore<TSchema extends FeatureSchema> implements StorageProvider<TSchema> {
  private readonly db: unknown;

  private readonly tables: DrizzleTables;

  constructor(db: unknown, options: DrizzleFeatureStoreOptions) {
    this.db = db;
    this.tables = selectTables(options.dialect);
  }

  private async selectAll(table: unknown): Promise<any[]> {
    const database = this.db as { select: (fields?: unknown) => { from: (tableRef: unknown) => Promise<any[]> } };
    return database.select().from(table);
  }

  async getEnvironmentDefinition(environment: string): Promise<FeatureDefinitionSet<TSchema>> {
    const featuresRows = await this.selectAll(this.tables.features);
    const defaultsRows = await this.selectAll(this.tables.environmentDefaults);
    const rulesRows = await this.selectAll(this.tables.rules);

    const features = featuresRows.reduce((acc, row) => {
      acc[row.key as keyof TSchema] = {
        key: row.key,
        description: row.description ?? undefined,
        defaultValue: parseValue(row.defaultValue, row.valueType) as TSchema[keyof TSchema],
      };
      return acc;
    }, {} as FeatureDefinitionSet<TSchema>['features']);

    const environments: FeatureDefinitionSet<TSchema>['environments'] = {};
    defaultsRows
      .filter((row) => row.environment)
      .forEach((row) => {
        const envName = row.environment as string;
        if (!environments[envName]) {
          environments[envName] = { name: envName, defaults: {}, rules: {} } as FeatureDefinitionSet<TSchema>['environments'][string];
        }
        const featureKey = row.featureKey as keyof TSchema;
        environments[envName].defaults = environments[envName].defaults ?? {};
        environments[envName].defaults![featureKey] = parseValue(row.value) as TSchema[keyof TSchema];
      });

    const groupedRules = rulesRows.reduce((acc, row) => {
      const envName = row.environment as string;
      const featureKey = row.featureKey as keyof TSchema;
      const rule: Rule<TSchema[keyof TSchema]> = {
        id: row.id,
        value: parseValue(row.value) as TSchema[keyof TSchema],
        priority: row.priority ?? undefined,
        percentage: typeof row.percentage === 'string' ? Number(row.percentage) : row.percentage ?? undefined,
        segmentId: row.segmentId ?? undefined,
        conditions: row.conditions ? (JSON.parse(row.conditions) as Rule<TSchema[keyof TSchema]>['conditions']) : undefined,
      };
      if (!acc[envName]) {
        acc[envName] = {} as Record<string, Rule<TSchema[keyof TSchema]>[]>;
      }
      if (!acc[envName]![featureKey as string]) {
        acc[envName]![featureKey as string] = [];
      }
      acc[envName]![featureKey as string].push(rule);
      return acc;
    }, {} as Record<string, Record<string, Rule<TSchema[keyof TSchema]>[]>>);

    Object.entries(groupedRules).forEach(([envName, rules]) => {
      if (!environments[envName]) {
        environments[envName] = { name: envName, defaults: {}, rules: {} } as FeatureDefinitionSet<TSchema>['environments'][string];
      }
      environments[envName].rules = {
        ...(environments[envName].rules ?? {}),
        ...(rules as unknown as FeatureDefinitionSet<TSchema>['environments'][string]['rules']),
      };
    });

    if (!environments[environment]) {
      environments[environment] = { name: environment, defaults: {}, rules: {} } as FeatureDefinitionSet<TSchema>['environments'][string];
    }

    return {
      features,
      environments,
    };
  }

  async getSegments(): Promise<Segment[]> {
    const rows = await this.selectAll(this.tables.segments);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      conditions: row.conditions ? JSON.parse(row.conditions) : [],
    }));
  }

  async getVersion(environment: string): Promise<string | number> {
    const database = this.db as {
      select: (fields: unknown) => { from: (table: unknown) => Promise<any[]> };
    };
    const rows = await database.select().from(this.tables.versions);
    const match = rows.find((row) => row.environment === environment);
    return match?.version ?? 0;
  }

  async getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null> {
    const database = this.db as {
      select: (fields?: unknown) => { from: (table: unknown) => { where: (predicate: unknown) => Promise<any[]> } };
    };
    const query = database.select().from(this.tables.userOverrides);
    if (!query || typeof query.where !== 'function') {
      return null;
    }
    const rows = await query.where(eq((this.tables.userOverrides as any).identityKey, identityKey));
    if (!rows.length) {
      return null;
    }
    return rows.reduce((acc, row) => {
      acc[row.featureKey as keyof TSchema] = parseValue(row.value) as TSchema[keyof TSchema];
      return acc;
    }, {} as Partial<TSchema>);
  }

  async setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void> {
    const database = this.db as {
      delete: (table: unknown) => { where: (predicate: unknown) => Promise<void> };
      insert: (table: unknown) => { values: (values: any[]) => Promise<void> };
    };
    await database.delete(this.tables.userOverrides).where(eq((this.tables.userOverrides as any).identityKey, identityKey));
    const entries = Object.entries(overrides).map(([featureKey, value]) => ({
      identityKey,
      featureKey,
      value: serializeValue(value as FeatureValue),
    }));
    if (entries.length) {
      await database.insert(this.tables.userOverrides).values(entries);
    }
  }
}

export * from './schema';
