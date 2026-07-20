# Contracts

Rust domain types are canonical during backend foundation work. `./scripts/generate.sh` exports transport schemas into `generated/contracts`.

Future clients generate or validate language-specific bindings from these schemas. Hand-written client types must pass shared serialization fixtures.
