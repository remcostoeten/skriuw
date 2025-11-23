# Recipes

## Per-organization flag

Include `orgId` in the evaluation context and add rules scoped to the organization.

```ts
engine.evaluate({ environment: 'production', isAuthenticated: true, userId, orgId });
```

## Gradual rollout

Add a rule with `percentage` set to the rollout percentage. The engine uses stable hashing to ensure deterministic buckets.

```ts
rules: {
  newNavbar: [{ id: 'gradual', value: true, percentage: 10 }]
}
```

## A/B testing

Combine segments with overrides to split traffic. Attach evidence from `explain` to analytics events to understand which rule activated a feature.
