# Shared utilities

`@skriuw/shared` contains framework-independent helpers used by v2 products.
Product rules live in `@skriuw/renderer-core`; themes and icons keep their own
packages. Add a helper when existing consumers need the same behavior.

Import each helper directly:

```ts
import { clamp } from "@skriuw/shared/helpers/clamp";
import { noop } from "@skriuw/shared/helpers/noop";

const opacity = clamp(1.2, 0, 1);
const onDismiss = noop;
```

`clamp(value, minimum, maximum)` preserves fractional values and includes both
bounds. Supply bounds in ascending order. A NaN argument produces NaN.
`noop()` returns undefined and performs no work; use it for deliberately ignored
callbacks or failures that do not require recovery.

Each helper documents its types, behavior, and usage in JSDoc beside its source.
Tests mirror the source under `__tests__/packages/shared/src/helpers/`.

Run this package's tests from the repository root:

```bash
bun run --cwd packages/shared test
```

The desktop gate includes these tests. See [TypeScript testing](../../docs/testing.md)
for the repository's test conventions.
