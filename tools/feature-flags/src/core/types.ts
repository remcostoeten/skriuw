export type FeatureValue = boolean | number | string | null;

export type FeatureSchema = Record<string, FeatureValue>;

export interface FeatureDefinition<TValue extends FeatureValue> {
  key: string;
  description?: string;
  defaultValue: TValue;
  tags?: string[];
}

export interface Condition {
  attribute: string;
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'exists'
    | 'not_exists';
  value?: FeatureValue | FeatureValue[];
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  conditions: Condition[];
}

export interface Rule<TValue extends FeatureValue> {
  id: string;
  value: TValue;
  priority?: number;
  percentage?: number;
  segmentId?: string;
  conditions?: Condition[];
}

export type FeatureRuleMap<TSchema extends FeatureSchema> = {
  [K in keyof TSchema]?: Rule<TSchema[K]>[];
};

export interface EnvironmentDefinition<TSchema extends FeatureSchema> {
  name: string;
  defaults?: Partial<TSchema>;
  rules?: FeatureRuleMap<TSchema>;
}

export type EnvironmentDefinitions<TSchema extends FeatureSchema> = Record<string, EnvironmentDefinition<TSchema>>;

export type FeatureDefinitions<TSchema extends FeatureSchema> = {
  [K in keyof TSchema]: FeatureDefinition<TSchema[K]>;
};

export interface FeatureDefinitionSet<TSchema extends FeatureSchema> {
  features: FeatureDefinitions<TSchema>;
  environments: EnvironmentDefinitions<TSchema>;
}

export interface Context {
  userId?: string;
  orgId?: string;
  isAuthenticated: boolean;
  ip?: string;
  fingerprint?: string;
  traits?: Record<string, FeatureValue>;
  environment: string;
  requestMeta?: {
    userAgent?: string;
    headers?: Record<string, string>;
  };
}

export type IdentityMethod = 'userId' | 'fingerprint' | 'ip' | 'anonymous';

export interface IdentityResult {
  identityKey: string;
  method: IdentityMethod;
}

export type IdentityResolver = (ctx: Context) => IdentityResult;

export interface ExplainLayer {
  layer: 'default' | 'environment' | 'segment' | 'rule' | 'user-override' | 'local-override';
  source?: string;
  ruleId?: string;
  segmentId?: string;
  reason?: string;
}

export interface FeatureExplainEntry<TValue extends FeatureValue> {
  key: string;
  value: TValue;
  layers: ExplainLayer[];
  bucket?: number;
}

export type Explain<TSchema extends FeatureSchema> = {
  [K in keyof TSchema]: FeatureExplainEntry<TSchema[K]>;
};

export interface EvaluatedState<TSchema extends FeatureSchema> {
  state: TSchema;
  explain: Explain<TSchema>;
  identity: IdentityResult;
  version: string | number;
  userOverrides?: Partial<TSchema> | null;
}

export interface StorageProvider<TSchema extends FeatureSchema> {
  getEnvironmentDefinition(env: string): Promise<FeatureDefinitionSet<TSchema>>;
  getSegments(): Promise<Segment[]>;
  getVersion(env: string): Promise<string | number>;
  getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null>;
  setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void>;
}

export interface AsyncCacheValue<T> {
  value: T;
  expiresAt: number;
  version?: string | number;
}

export interface AsyncCache<T> {
  get(key: string): Promise<AsyncCacheValue<T> | undefined>;
  set(key: string, value: AsyncCacheValue<T>): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EngineOptions<TSchema extends FeatureSchema> {
  storage: StorageProvider<TSchema>;
  identityResolver?: IdentityResolver;
  cache?: AsyncCache<FeatureDefinitionSet<TSchema>>;
  segmentsCache?: AsyncCache<Segment[]>;
  defaultEnvironment?: string;
}
