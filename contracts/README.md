# Contracts

Rust domain types are canonical during backend foundation work. `./scripts/generate.sh` exports transport schemas into `contracts/generated`.

Future clients generate or validate language-specific bindings from these schemas. Hand-written client types must pass shared serialization fixtures. `workspace-archive.schema.json` is the portable desktop/web interchange contract and excludes adapter-owned caches and queues.

Cloud sync uses the same rule. `sync-*.schema.json` is generated from Rust and
`workspace-operation-sync-policy-v1.json` is the generated Worker policy.
`fixtures/sync-push-v1.json` is the first cross-language golden request. Inline
sync operations are deliberately bounded; larger content requires the chunked
transport tracked in `docs/specs/cloud-sync-master.md`. See the canonical
[operation policy](../docs/specs/workspace-operation-sync-policy-v1.md).
