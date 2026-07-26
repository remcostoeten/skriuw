# Provider import planning benchmark

- Date: 2026-07-26
- Platform: Linux 7.1.2, x86-64
- CPU: Intel Core i7-10700F, 16 logical CPUs
- Runtime: Node.js 24.16.0

## Scenario

`planImportBundle` receives 10,000 flat Markdown notes under one imported folder.
Each note contains a unique title and a short body. No tags, properties, images,
or existing workspace references are present.

## Result

- Planning time: 258 ms
- Planned notes: 10,000
- Planned folders: 1
- Workspace operations: 20,001

The regression test allows 5,000 ms to absorb slower CI machines while still
catching accidental quadratic planning behavior.
