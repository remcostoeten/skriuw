# Drizzle ORM schema

The Drizzle adapter ships opinionated tables for features, rules, segments, and user overrides. Use the exports from
`@skriuw/feature-flags/adapters/drizzle` to generate migrations.

```ts
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteFeatures, sqliteEnvironmentDefaults, sqliteRules, sqliteSegments, sqliteUserOverrides } from '@skriuw/feature-flags/adapters/drizzle';
```

To create migrations run `drizzle-kit generate:sqlite --schema=.../schema.ts`.
