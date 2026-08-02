# Skriuw documentation

This directory contains repository-level technical records. The published documentation website uses `apps/documentation/content/docs/` as its canonical source.

## Start here

| Area                        | Canonical documentation                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Current v2 desktop app      | [`v2/README.md`](../v2/README.md)                                                                                                 |
| v2 features                 | [`v2/FEATURES.md`](../v2/FEATURES.md)                                                                                             |
| v2 architecture             | [`v2/ARCHITECTURE.md`](../v2/ARCHITECTURE.md)                                                                                     |
| v2 decisions                | [`v2/docs/adr/`](../v2/docs/adr)                                                                                                  |
| v2 specifications           | [`v2/docs/specs/`](../v2/docs/specs)                                                                                              |
| v2 data and recovery        | [`v2/docs/data-model.md`](../v2/docs/data-model.md) and [`v2/docs/recovery.md`](../v2/docs/recovery.md)                           |
| v2 performance evidence     | [`v2/docs/performance-contract.md`](../v2/docs/performance-contract.md) and [`v2/docs/benchmarks/`](../v2/docs/benchmarks)        |
| v1 architecture             | [`apps/documentation/content/docs/development/architecture.mdx`](../apps/documentation/content/docs/development/architecture.mdx) |
| v1 features and user guides | [`apps/documentation/content/docs/`](../apps/documentation/content/docs)                                                          |
| Contributing                | [`CONTRIBUTING.md`](../CONTRIBUTING.md)                                                                                           |
| Security                    | [`SECURITY.md`](../SECURITY.md)                                                                                                   |

## Where documentation belongs

- Put published user and v1 developer documentation in `apps/documentation/content/docs/`.
- Put v2 architecture decisions in `v2/docs/adr/`.
- Put durable v2 implementation contracts in `v2/docs/specs/`.
- Put measured v2 performance results in `v2/docs/benchmarks/`.
- Put cross-repository technical records in this directory.
- Keep temporary plans, agent handoffs, generated audits, and task notes outside the repository.

Link to an existing canonical document instead of copying it into another tree.
