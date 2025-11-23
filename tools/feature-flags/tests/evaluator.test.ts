import { describe, expect, it } from 'vitest';
import {
  createFeatureEngine,
  defaultIdentityResolver,
  evaluateDefinitionSet,
  InMemoryCache,
  InMemoryFeatureStore,
  type Context,
  type FeatureDefinitionSet,
} from '../src/core';

interface ExampleFeatures {
  newNavbar: boolean;
  badgePlacement: 'left' | 'right' | 'top';
  animationSpeedMs: number;
}

const definitions: FeatureDefinitionSet<ExampleFeatures> = {
  features: {
    newNavbar: { key: 'newNavbar', defaultValue: false },
    badgePlacement: { key: 'badgePlacement', defaultValue: 'left' },
    animationSpeedMs: { key: 'animationSpeedMs', defaultValue: 200 },
  },
  environments: {
    production: {
      name: 'production',
      defaults: { newNavbar: false, badgePlacement: 'left', animationSpeedMs: 250 },
      rules: {
        newNavbar: [
          {
            id: 'beta-users',
            priority: 10,
            value: true,
            segmentId: 'beta',
          },
        ],
        animationSpeedMs: [
          {
            id: 'slow-devices',
            priority: 5,
            value: 400,
            conditions: [{ attribute: 'traits.device', operator: 'eq', value: 'slow' }],
          },
          { id: 'gradual', priority: 1, value: 350, percentage: 50 },
        ],
      },
    },
  },
};

const segments = [
  {
    id: 'beta',
    name: 'beta testers',
    conditions: [{ attribute: 'traits.group', operator: 'eq', value: 'beta' }],
  },
];

describe('evaluateDefinitionSet', () => {
  const resolver = defaultIdentityResolver({ salt: 'test' });

  it('applies environment defaults and rules', () => {
    const context: Context = {
      environment: 'production',
      isAuthenticated: true,
      userId: 'user-1',
      traits: { group: 'beta' },
    };
    const identity = resolver(context);
    const evaluated = evaluateDefinitionSet(definitions, context, identity, segments);
    expect(evaluated.state.newNavbar).toBe(true);
    expect(evaluated.explain.newNavbar.layers.at(-1)?.layer).toBe('rule');
  });

  it('respects user overrides and percentage rollouts', () => {
    const context: Context = {
      environment: 'production',
      isAuthenticated: true,
      userId: 'user-2',
      traits: { device: 'slow' },
    };
    const identity = resolver(context);
    const evaluated = evaluateDefinitionSet(definitions, context, identity, segments, {
      userOverrides: { newNavbar: false },
    });
    expect(evaluated.state.newNavbar).toBe(false);
    expect(evaluated.explain.newNavbar.layers.at(-1)?.layer).toBe('user-override');
    expect(typeof evaluated.explain.animationSpeedMs.bucket === 'number').toBe(true);
  });
});

describe('feature engine', () => {
  it('evaluates using storage provider and caches results', async () => {
    const storage = new InMemoryFeatureStore<ExampleFeatures>({
      definitions,
      segments,
    });
    const engine = createFeatureEngine<ExampleFeatures>({
      storage,
      cache: new InMemoryCache(5_000),
    });
    const result = await engine.evaluate({
      environment: 'production',
      isAuthenticated: true,
      userId: 'user-3',
    });
    expect(result.state.newNavbar).toBe(false);
    expect(result.identity.identityKey).toBe('user-3');
  });
});
