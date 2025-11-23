'use client';

import type { ReactNode } from 'react';
import { FeatureProvider } from '@skriuw/feature-flags/react';
import type { EvaluatedState } from '@skriuw/feature-flags/core';
import { clientStore, type DemoFeatures } from '../feature-flags';

interface ClientFeatureProviderProps {
  snapshot: EvaluatedState<DemoFeatures>;
  context: {
    userId?: string;
    isAuthenticated: boolean;
    traits?: Record<string, string | number | boolean>;
  };
  children: ReactNode;
}

export function ClientFeatureProvider({ snapshot, context, children }: ClientFeatureProviderProps) {
  return (
    <FeatureProvider<DemoFeatures>
      storage={clientStore}
      environment="production"
      context={context}
      defaultState={snapshot.state}
      ssrSnapshot={snapshot}
    >
      {children}
    </FeatureProvider>
  );
}
