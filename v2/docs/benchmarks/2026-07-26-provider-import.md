# Provider import planning and post-commit navigation benchmark

- Date: 2026-07-26
- Platform: Linux 7.1.2, x86-64
- CPU: Intel Core i7-10700F, 16 logical CPUs
- Runtime: Node.js 24.16.0

## Scenario

`planImportBundle` receives 10,000 flat Markdown notes under one imported folder.
Each note contains a unique title and short body. Durable receipt operations are
included. The resulting optimistic operation batch is applied to the renderer
store, then navigation selects an existing note.

## Result

- Planning time: 230.27 ms
- Optimistic commit projection: 37.48 ms
- First post-import navigation: 0.34 ms
- Planned notes: 10,000
- Planned folders: 1
- Workspace operations: 30,001

The regression test allows 5,000 ms each for planning and optimistic projection
on slower CI machines. Post-import navigation must remain within one 16.7 ms
frame.
