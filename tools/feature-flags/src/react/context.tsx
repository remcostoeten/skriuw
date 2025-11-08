import { createContext } from 'react';
import type { EvaluatedState, FeatureSchema } from '../core';

export interface FeatureContextValue<TSchema extends FeatureSchema> {
  state: TSchema;
  explain: EvaluatedState<TSchema>['explain'];
  hydrated: boolean;
  setLocalOverride: (key: keyof TSchema, value: TSchema[keyof TSchema]) => void;
  resetOverrides: () => void;
  version?: string | number;
  userOverrides?: Partial<TSchema> | null;
}

export const FeatureContext = createContext<FeatureContextValue<any> | undefined>(undefined);
