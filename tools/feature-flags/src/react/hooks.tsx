import { useContext, useMemo } from 'react';
import type { FeatureSchema } from '../core';
import { FeatureContext } from './context';
import type { FeatureContextValue } from './context';

export function useFeatures<TSchema extends FeatureSchema>(): FeatureContextValue<TSchema> {
  const value = useContext(FeatureContext);
  if (!value) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return value as FeatureContextValue<TSchema>;
}

export function useFeature<TSchema extends FeatureSchema, TKey extends keyof TSchema>(key: TKey) {
  const { state, setLocalOverride, explain, hydrated, version } = useFeatures<TSchema>();
  const value = state[key];
  return useMemo(
    () => ({
      value,
      hydrated,
      version,
      explain: explain[key],
      set: (next: TSchema[TKey]) => setLocalOverride(key, next),
    }),
    [explain, hydrated, key, setLocalOverride, value, version],
  );
}
