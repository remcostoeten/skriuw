# Engineering rules

These rules apply to the complete repository.

## Session continuity

- Read `TODO.md`, `docs/handoff.md`, `ARCHITECTURE.md`, and relevant ADRs before changing code.
- Verify branch, worktree, recent commits, and test state instead of trusting stale handoff numbers.
- Update `TODO.md` and `docs/handoff.md` after every completed implementation slice.
- Keep the immediate next task and known correctness gaps explicit.
- Commit verified slices separately in dependency order.

## Product contract

- Treat post-startup interaction latency as a correctness requirement.
- Keep navigation independent from disk, IPC, network, parsing, Git, and lazy loading.
- Preserve the local-first desktop path while keeping domain contracts portable to a future web runtime.
- Do not add a framework, dependency, abstraction, or animation without a measured product need.

## TypeScript and React

- Use `type`; never use `interface`.
- Build shared base types and specialize them with intersections instead of repeating fields.
- Name one component-local prop type `Props`.
- Prefer `function Component()` and named function declarations.
- Use arrow functions for callbacks, memoized values, and caches.
- Prefer functional composition, pure transformations, small components, and shared utilities.
- Avoid classes unless an external API requires one at a boundary.
- Derive values during render. Use functional state setters. Keep transient values in refs.
- Split subscriptions by dependency. Never subscribe a component to state it does not render.
- Do not create components inside render functions.
- Keep hot editor state outside broad React context.
- Do not add code comments. Put durable explanation in documentation or an ADR.

## Performance

- Profile production builds with representative fixtures.
- Enable React Scan only in development and profiling builds.
- Record render counts, interaction marks, frame times, and long animation frames.
- Treat unnecessary shell, sidebar, editor-host, and metadata-panel renders as defects.
- Avoid barrel imports. Import directly from owning modules.
- Load all navigation-critical code and data before startup completes.
- Use `Set`, `Map`, early returns, stable listeners, and cached reads in measured hot paths.
- Do not animate keyboard navigation or high-frequency actions.
- Prefer `transform` and `opacity` for permitted motion.

## Visual and interaction

- Preserve the existing application's dense desktop information architecture.
- Use deliberate typography, restrained color, subtle focus, and background-tinted shadows.
- Avoid pure black, neon glow, glassmorphism, large radii, heavy shadows, decorative blur, and generic card grids.
- Prefer CSS Grid for primary layout.
- Provide complete empty, error, disabled, active, and reduced-motion states.
- Avoid generic circular loading spinners.

## Rust and storage

- Keep domain code free from database, filesystem, framework, and operating-system dependencies.
- Express backend capabilities as narrow use-case traits, not table-shaped CRUD.
- Keep SQLite transactions atomic and all durable writes serialized.
- Keep Git and rebuildable projections off editing and navigation paths.
- Do not hide recovery-relevant failures.

## Verification

- Run `./scripts/check.sh` after implementation changes.
- Generate committed contracts with `./scripts/generate.sh`.
- Add regression tests for every domain invariant and persistence failure mode.
- Performance-sensitive changes require fixture measurements against `docs/performance-contract.md`.
