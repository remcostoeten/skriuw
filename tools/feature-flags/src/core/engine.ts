import { evaluateDefinitionSet } from './evaluator';
import { defaultIdentityResolver } from './identity';
import type {
  AsyncCache,
  Context,
  EngineOptions,
  EvaluatedState,
  FeatureDefinitionSet,
  FeatureSchema,
  IdentityResult,
  Segment,
  StorageProvider,
} from './types';

function cacheKeyForEnvironment(environment: string): string {
  return `defs:${environment}`;
}

async function loadWithCache<T>(
  cache: AsyncCache<T> | undefined,
  key: string,
  loader: () => Promise<{ value: T; version?: string | number }>,
  version?: string | number,
): Promise<T> {
  if (!cache) {
    const { value } = await loader();
    return value;
  }
  const cached = await cache.get(key);
  if (cached && (!version || cached.version === version) && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const { value, version: loadedVersion } = await loader();
  await cache.set(key, {
    value,
    expiresAt: Date.now() + 30_000,
    version: version ?? loadedVersion,
  });
  return value;
}

export interface EvaluateOptions<TSchema extends FeatureSchema> {
  localOverrides?: Partial<TSchema> | null;
  includeUserOverrides?: boolean;
}

export interface FeatureEngine<TSchema extends FeatureSchema> {
  evaluate(context: Context, options?: EvaluateOptions<TSchema>): Promise<EvaluatedState<TSchema>>;
  getIdentity(context: Context): IdentityResult;
  setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void>;
  getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null>;
  clearCache(): Promise<void>;
  createHydrationPayload(state: EvaluatedState<TSchema>): string;
  parseHydrationPayload(payload: string): EvaluatedState<TSchema>;
}

export function createFeatureEngine<TSchema extends FeatureSchema>(
  options: EngineOptions<TSchema>,
): FeatureEngine<TSchema> {
  const identityResolver = options.identityResolver ?? defaultIdentityResolver();
  const cache = options.cache;
  const segmentsCache = options.segmentsCache;
  const storage: StorageProvider<TSchema> = options.storage;

  async function loadSegments(): Promise<Segment[]> {
    return loadWithCache(segmentsCache, 'segments', async () => ({ value: await storage.getSegments() }));
  }

  async function loadDefinitions(environment: string): Promise<{ defs: FeatureDefinitionSet<TSchema>; version: string | number }>
  {
    const version = await storage.getVersion(environment);
    const defs = await loadWithCache(
      cache,
      cacheKeyForEnvironment(environment),
      async () => {
        const result = await storage.getEnvironmentDefinition(environment);
        return { value: result, version };
      },
      version,
    );
    return { defs, version };
  }

  async function evaluate(context: Context, evaluateOptions: EvaluateOptions<TSchema> = {}): Promise<EvaluatedState<TSchema>> {
    const environment = context.environment || options.defaultEnvironment || 'production';
    const ctx: Context = { ...context, environment };
    const identity = identityResolver(ctx);
    const [{ defs, version }, segments, userOverrides] = await Promise.all([
      loadDefinitions(environment),
      loadSegments(),
      evaluateOptions.includeUserOverrides === false
        ? Promise.resolve<Partial<TSchema> | null>(null)
        : storage.getUserOverrides(identity.identityKey),
    ]);

    const evaluated = evaluateDefinitionSet(defs, ctx, identity, segments, {
      userOverrides: userOverrides ?? undefined,
      localOverrides: evaluateOptions.localOverrides ?? undefined,
    });

    return { ...evaluated, version, userOverrides: userOverrides ?? null };
  }

  async function clearCache(): Promise<void> {
    if (cache) {
      const environments = new Set(['production', 'staging', 'development']);
      if (options.defaultEnvironment) {
        environments.add(options.defaultEnvironment);
      }
      for (const envName of environments) {
        await cache.delete(cacheKeyForEnvironment(envName));
      }
    }
    if (segmentsCache) {
      await segmentsCache.delete('segments');
    }
  }

  return {
    evaluate,
    getIdentity: (context: Context) => identityResolver(context),
    setUserOverrides: (identityKey: string, overrides: Partial<TSchema>) => storage.setUserOverrides(identityKey, overrides),
    getUserOverrides: (identityKey: string) => storage.getUserOverrides(identityKey),
    clearCache,
    createHydrationPayload: (state) => JSON.stringify(state),
    parseHydrationPayload: (payload) => JSON.parse(payload) as EvaluatedState<TSchema>,
  };
}
