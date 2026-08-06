# v2 cloud and browser prompt runbook

These root-level prompt files are requested working artifacts. They are not
canonical product documentation and should not be committed unless explicitly
requested. Repository status and the canonical tracker always override stale
prompt text.

## Prompt order

1. `1.md` — replication policy; already implemented.
2. Native outbox and inbound storage — already implemented in the current dirty
   tree; finish documentation and full verification before depending on it.
3. `2.md` — cloud authentication and workspace authorization.
4. `3.md` — desktop coordinator; requires authenticated cloud routes. It may
   build against a fake transport earlier but must keep production sync off.
5. `4.md` — convergence/conflict matrix can begin as specification work now;
   integration follows storage/coordinator availability.
6. `5.md` — chunks/checkpoints; requires authenticated routes and review of new
   protocol behavior by the convergence/policy work.
7. `6.md` — browser SQLite-WASM/OPFS can proceed independently as a local
   runtime, then later consume authenticated sync and checkpoint hydration.

Safe parallel wave: run `2.md`, the specification-only portion of `4.md`, and
`6.md` concurrently only in isolated worktrees or with explicitly disjoint file
ownership. Do not run multiple agents against this same dirty tree without an
integration owner.

## Model selection

| Work                                      | Lead                | Optional reviewer/subagent                       |
| ----------------------------------------- | ------------------- | ------------------------------------------------ |
| Repository implementation and integration | Codex Sol           | Codex Sol or Terra on disjoint tests/inventories |
| Security and authorization critique       | Codex Sol           | Opus/Fable-class model if the runner exposes one |
| State-machine and convergence critique    | Codex Sol           | Opus/Fable-class model if available              |
| Mechanical inventory and test enumeration | Codex Sol           | Terra                                            |
| Final verification and handoff            | Codex Sol lead only | Reviewers may inspect results                    |

In the current Codex environment, callable overrides are Codex Sol and Terra.
Names such as Opus or Fable are therefore optional external runner aliases, not
assumed capabilities. When unavailable, keep the same role and use Codex Sol.

## Spawn rules

- The lead reads `AGENTS.md` and all prompt-required material before spawning.
- Spawn only concrete bounded tasks with a named output and non-overlapping
  ownership.
- Analysis-only reviewers do not edit files.
- Never assign the same migration, generated contract, core operation match,
  Worker router, or bridge interface to two agents.
- Subagent completion is not task completion. The lead inspects changes, resolves
  contradictions, regenerates contracts, runs the complete required gates, and
  provides the handoff.
- A missing credential, provider choice, product decision, or authorization
  prerequisite is reported honestly; agents must not bypass it.
