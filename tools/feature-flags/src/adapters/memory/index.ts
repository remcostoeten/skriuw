import type {
  FeatureDefinitionSet,
  FeatureSchema,
  Segment,
  StorageProvider,
} from '../../core';

export interface InMemoryFeatureStoreOptions<TSchema extends FeatureSchema> {
  definitions: FeatureDefinitionSet<TSchema>;
  segments?: Segment[];
  version?: string | number;
  overrides?: Record<string, Partial<TSchema>>;
}

export class InMemoryFeatureStore<TSchema extends FeatureSchema> implements StorageProvider<TSchema> {
  private readonly definitions: FeatureDefinitionSet<TSchema>;

  private readonly segments: Segment[];

  private readonly overrides: Map<string, Partial<TSchema>>;

  private version: string | number;

  constructor(options: InMemoryFeatureStoreOptions<TSchema>) {
    this.definitions = options.definitions;
    this.segments = options.segments ?? [];
    this.overrides = new Map(Object.entries(options.overrides ?? {}));
    this.version = options.version ?? Date.now();
  }

  async getEnvironmentDefinition(_env: string): Promise<FeatureDefinitionSet<TSchema>> {
    return this.definitions;
  }

  async getSegments(): Promise<Segment[]> {
    return this.segments;
  }

  async getVersion(_env: string): Promise<string | number> {
    return this.version;
  }

  async getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null> {
    return this.overrides.get(identityKey) ?? null;
  }

  async setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void> {
    this.overrides.set(identityKey, overrides);
    this.version = Date.now();
  }
}
