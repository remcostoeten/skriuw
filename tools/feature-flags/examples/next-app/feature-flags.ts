import {
  createFeatureEngine,
  defaultIdentityResolver,
  InMemoryCache,
  InMemoryFeatureStore,
  type FeatureDefinitionSet,
} from '@skriuw/feature-flags/core';
import { LocalStorageFeatureStore } from '@skriuw/feature-flags/adapters/local-storage';

export type DemoFeatures = {
  newNavbar: boolean;
  badgePlacement: 'left' | 'right';
  animationSpeedMs: number;
};

const definitions: FeatureDefinitionSet<DemoFeatures> = {
  features: {
    newNavbar: { key: 'newNavbar', defaultValue: false },
    badgePlacement: { key: 'badgePlacement', defaultValue: 'left' },
    animationSpeedMs: { key: 'animationSpeedMs', defaultValue: 240 },
  },
  environments: {
    production: {
      name: 'production',
      defaults: { newNavbar: true },
      rules: {
        newNavbar: [
          {
            id: 'beta-users',
            value: true,
            priority: 10,
            segmentId: 'beta-testers',
          },
        ],
      },
    },
  },
};

export const memoryStore = new InMemoryFeatureStore<DemoFeatures>({
  definitions,
  segments: [
    {
      id: 'beta-testers',
      name: 'Beta Testers',
      conditions: [{ attribute: 'traits.role', operator: 'eq', value: 'beta' }],
    },
  ],
});

export const clientStore = new LocalStorageFeatureStore<DemoFeatures>({
  storageKey: 'demo-flags',
  definitions,
});

export const engine = createFeatureEngine<DemoFeatures>({
  storage: memoryStore,
  cache: new InMemoryCache(30_000),
  identityResolver: defaultIdentityResolver({ salt: 'demo-app' }),
});
