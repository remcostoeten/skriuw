import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Context,
  EvaluatedState,
  FeatureSchema,
  FeatureEngine,
  IdentityResolver,
  StorageProvider,
} from '../core';
import { createFeatureEngine, defaultIdentityResolver, InMemoryCache } from '../core';
import { FeatureContext } from './context';
import type { FeatureContextValue } from './context';

export interface FeatureProviderProps<TSchema extends FeatureSchema> {
  storage: StorageProvider<TSchema>;
  environment: string;
  context: Omit<Context, 'environment'>;
  defaultState: TSchema;
  identityResolver?: IdentityResolver;
  ssrSnapshot?: EvaluatedState<TSchema>;
  onUpdate?: (state: EvaluatedState<TSchema>) => void;
  children: ReactNode;
}

export function FeatureProvider<TSchema extends FeatureSchema>({
  storage,
  environment,
  context,
  defaultState,
  identityResolver,
  ssrSnapshot,
  onUpdate,
  children,
}: FeatureProviderProps<TSchema>) {
  const resolver = useMemo(
    () => identityResolver ?? defaultIdentityResolver(),
    [identityResolver],
  );
  const engine = useMemo<FeatureEngine<TSchema>>(
    () =>
      createFeatureEngine({
        storage,
        identityResolver: resolver,
        cache: new InMemoryCache(60_000),
      }),
    [storage, resolver],
  );

  const [evaluated, setEvaluated] = useState<EvaluatedState<TSchema>>(
    ssrSnapshot ?? {
      state: defaultState,
      explain: {} as EvaluatedState<TSchema>['explain'],
      identity: engine.getIdentity({ ...context, environment }),
      version: 'initial',
      userOverrides: null,
    },
  );
  const [hydrated, setHydrated] = useState<boolean>(Boolean(ssrSnapshot));
  const [localOverrides, setLocalOverrides] = useState<Partial<TSchema>>({});
  const identityRef = useRef(evaluated.identity);
  const userOverridesRef = useRef<Partial<TSchema> | null>(evaluated.userOverrides ?? null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchState = async () => {
      const result = await engine.evaluate(
        {
          ...context,
          environment,
        },
        { localOverrides },
      );
      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }
      identityRef.current = result.identity;
      userOverridesRef.current = result.userOverrides ?? null;
      setEvaluated(result);
      setHydrated(true);
      onUpdate?.(result);
    };
    fetchState().catch((error) => {
      console.error('Failed to evaluate features', error);
    });
    return () => controller.abort();
  }, [engine, environment, context, localOverrides, onUpdate]);

  const setLocalOverride = useCallback(
    (key: keyof TSchema, value: TSchema[keyof TSchema]) => {
      let nextOverrides: Partial<TSchema> = {};
      setLocalOverrides((prev) => {
        nextOverrides = { ...prev, [key]: value };
        return nextOverrides;
      });
      setEvaluated((prev) => {
        const next = {
          ...prev,
          state: { ...prev.state, [key]: value },
          explain: {
            ...prev.explain,
            [key]: {
              key: key as string,
              value,
              layers: [
                ...(prev.explain?.[key]?.layers?.filter((layer) => layer.layer !== 'local-override') ?? []),
                { layer: 'local-override' as const, reason: 'optimistic override' },
              ],
            },
          },
        } as EvaluatedState<TSchema>;
        return next;
      });
      const identity = identityRef.current;
      if (identity) {
        const merged = {
          ...(userOverridesRef.current ?? {}),
          ...nextOverrides,
        } as Partial<TSchema>;
        userOverridesRef.current = merged;
        engine
          .setUserOverrides(identity.identityKey, merged)
          .catch((error) => console.error('Failed to persist feature override', error));
      }
    },
    [engine],
  );

  const resetOverrides = useCallback(() => {
    setLocalOverrides({});
    userOverridesRef.current = null;
    const identity = identityRef.current;
    if (identity) {
      engine
        .setUserOverrides(identity.identityKey, {})
        .catch((error) => console.error('Failed to reset overrides', error));
    }
  }, [engine]);

  const value = useMemo<FeatureContextValue<TSchema>>(
    () => ({
      state: evaluated.state,
      explain: evaluated.explain,
      hydrated,
      setLocalOverride,
      resetOverrides,
      version: evaluated.version,
      userOverrides: evaluated.userOverrides ?? null,
    }),
    [evaluated, hydrated, resetOverrides, setLocalOverride],
  );

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}
