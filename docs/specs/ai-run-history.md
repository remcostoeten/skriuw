# AI run history and token usage

The product contract ADR-0033 requires before locally persisting per-request AI
metadata. It covers what is recorded, where, for how long, and how it is erased.

## Recording point

Recording happens in exactly one place: `AiCompletionService` in `skriuw-ai`,
the provider seam every completion already passes through. A feature cannot
record a run of its own, and cannot skip recording one.

The seam records after the terminal event has been published to the renderer,
and hands the record to an `AiRunRecorder` that must not block. The desktop
implementation (`app/src-tauri/src/ai_history.rs`) pushes onto a bounded queue
drained by a dedicated thread holding its own SQLite connection, so accounting
never touches the serialized workspace queue, the renderer thread, or the
completion worker's delivery path. A full queue drops the record; diagnostics
data is not worth stalling a completion for.

## Recorded fields

Per run: run id, start timestamp, origin, provider id, model id, prompt text or
a redacted marker, terminal state (`done`, `cancelled`, `timed_out`, `failed`),
the provider error category when it failed, duration, input and output token
counts with their source, and the computed remote cost in micro-dollars.

`origin` is the feature that fired the run — `playground` today, an editor
action id later. It is validated as an identifier at the command boundary so
renderer text cannot invent one.

## Token counts and estimates

A provider that reports usage wins: those counts are stored as
`AiTokenSource::Provider`. Everything else — providers that report nothing, and
every cancelled, timed-out, and failed run — is derived from transferred bytes
at four bytes per token and stored as `AiTokenSource::Estimated`.

An estimate is never presented as exact. Run rows prefix estimated counts with
`~`, aggregate buckets carry an `estimated` flag that stays sticky through every
roll-up, and the usage surface states in words that the provider reported no
counts.

## Cost

Cost is computed once, when the run terminalizes, from the shipped remote model
catalog (`skriuw-ai-remote/models.json`) through
`skriuw_domain::ai_run_cost_micros`. Prices are integer micro-dollars per
million tokens and the arithmetic runs in `u128`, so no floating-point money
exists anywhere in the path. A model with no catalog entry — every local
provider — records no cost rather than a guess. The surface names the
catalog's `pricingAsOf` date so the figure is never mistaken for an invoice.

## Aggregates

Aggregates are derived by query (`aggregate_ai_usage`), grouped by day,
provider, and model. No running total is stored, so a total can never drift
from the rows behind it.

## Storage, retention, and erasure

Runs live in `ai_run_history` in the workspace SQLite database (migration
`0017_ai_run_history`). The table is diagnostics-class local state: no
operation, archive, export, or sync payload references it, and tests prove
runs never reach an archive or the sync queue.

Retention is a count cap and an age cap, both stored in `ai_history_settings`
and applied inside the same transaction that appends a run. A run older than
the age cap does not survive its own write.

`retain_prompts` is enforced in `record_ai_run`, not by callers: with it off,
prompt text is dropped before the insert, so no path can write prompt text past
the toggle. Clearing history deletes every run under `PRAGMA secure_delete` and
truncates the write-ahead log, and a test asserts the prompt bytes are gone
from the database file and its sidecars afterwards.

## Surface

Settings → AI → Usage shows aggregate tokens, runs, and estimated remote cost
for a period, a per-model breakdown, and a run list filterable by provider,
model, and terminal state. Opening a run shows it read-only; when its prompt
was retained, "Rerun in playground" stages the prompt and model and navigates
to the playground. The whole surface is inside the AI opt-in gate.
