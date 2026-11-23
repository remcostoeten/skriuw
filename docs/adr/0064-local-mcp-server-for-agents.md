# ADR-0064: Agents reach the workspace through a local MCP server answered by the window

- Status: accepted
- Date: 2026-11-22

## Context

Coding agents such as Claude Code speak the Model Context Protocol. Pointing one
at Skriuw lets it file notes, plan work as tasks, and keep a project board up to
date from the terminal. Nothing in Skriuw accepted requests from outside the
process: the deep link only completes OAuth sign-in, and the sync Worker speaks
the internal operation-log protocol behind device authentication.

The rules that turn intent into operations live in the renderer, not in Rust:
the product Markdown parser, title derivation from the first line, checklist
task promotion ([ADR-0031](0031-explicit-task-promotion.md)), task
writes that keep the checklist line in step
([ADR-0053](0053-task-due-dates-live-in-the-checklist-line.md)), and database
cell and view planning ([ADR-0057](0057-database-views.md)). An agent writing to
SQLite directly, or a second Rust implementation of those rules, would bypass
or duplicate all of them, and the open window would not see the change until
something reloaded it.

## Decision

The desktop app runs an optional MCP server, off by default, using the
Streamable HTTP transport. Its JSON-RPC requests are executed by the main
window.

- **Transport.** `agent_server` in the Tauri crate listens on `127.0.0.1` at a
  configurable port (41783 by default). It answers `POST /mcp` with
  `application/json`, accepts notifications with `202`, refuses batches, and
  offers no event stream (`GET` is `405`). Bodies are capped at 4 MiB and every
  response closes the connection.
- **Admission.** A request must carry `Authorization: Bearer <token>`, compared
  in constant time, and a loopback `Host`. A browser `Origin` that is not
  loopback is refused, which closes DNS rebinding. The token is 32 random
  bytes, stored with the port and the on/off switch in `agent-server.json` in
  the app data directory with owner-only permissions. It never syncs. An
  unreadable file turns the server off and issues a new token.
- **Execution.** Rust forwards each request to the `main` window as an event and
  waits up to 60 seconds for `answer_agent_request`. The window attaches
  after the workspace opens and detaches on teardown. Until then, requests get a
  JSON-RPC error saying the workspace is not open. Tool calls run one at a time
  in arrival order.
- **Writes.** Tools build operations with the same helpers the interface uses
  and submit them through `commitOperations`, so agent changes apply
  optimistically, sync, enter history, and show up in the open window
  immediately. Reads flush pending editor saves first.
- **Boundaries.** Locked notes are refused for reading and writing even while
  the session has them unlocked. Folders and notes can only be moved to the
  trash and restored, never purged. Only standalone tasks can be deleted, because a
  task inside a note follows its checklist line. The journal folder cannot be
  moved, renamed, or used as a database.
- **Lanes.** Task statuses stay the fixed `todo`, `in_progress`, and `done`.
  Boards with custom lanes are databases: a folder shown as a board grouped by
  a select property whose options are the lanes.

## Consequences

Agents work only while Skriuw is open with its workspace loaded. That is the
price of reusing the renderer's rules instead of porting them. A headless mode
would need those rules in Rust first.

Anything on the machine that can read the token can change the workspace, the
same exposure as the database file itself. Rotating the token from settings
cuts every configured agent off at once.

The tool surface is a product contract. Renaming a tool or changing its
arguments breaks configured agents, so tools are added rather than reshaped.
