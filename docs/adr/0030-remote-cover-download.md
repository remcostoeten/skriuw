# 0030 — Remote cover download

## Status

Accepted, 2026-08-10. Narrows the "notes never fetch remote media" rule of the
asset pipeline to "notes never fetch remote media; the shell does, once, on an
explicit request".

## Context

Covers could only come from a local file or an asset already in the workspace.
A user holding an image address had to download it by hand and then upload it.

Notes deliberately do not load remote media: markdown carrying
`![](https://…)` parses into a `blocked_image` node, and the renderer's content
policy pins `img-src` to `'self' blob: data:` and `connect-src` to IPC plus
first-party hosts. Neither restriction is incidental — a note is untrusted
content, and a note that fetches must not be able to report back where and when
it was opened.

## Decision

The desktop shell downloads on request and stores the result as an ordinary
workspace blob. Nothing about the asset pipeline changes downstream.

- A new `download_remote_media` Tauri command fetches the bytes and hands them
  to `ImageStore::put`. Format is decided by magic bytes, as for any other
  blob, so a server that lies about its content type cannot smuggle in another
  file. A downloaded cover is indistinguishable from an uploaded one, which is
  why deduplication, sweeping, export, and sync need no changes.
- The URL is attacker-influenced input arriving from a paste, so `remote_media`
  refuses anything but `https`, resolves the host itself and rejects loopback,
  private, link-local, shared, benchmarking, and reserved addresses, then pins
  the request to the vetted address so a second DNS answer cannot substitute a
  private host after the check. Redirects are followed by hand, bounded, and
  re-validated per hop. Bodies are capped at 25 MB and read with a timeout.
- Fetching stays out of the renderer. Doing it there would require widening
  `connect-src` to the entire web, which would also widen what a note can
  reach.

## Consequences

The feature is desktop-only. The browser build has no Rust and cannot fetch
arbitrary hosts under CORS, so the picker hides the field there rather than
offering an action that fails on most addresses. Parity needs a proxy route in
`cloud/`, which would put the fetch — and its abuse surface and bandwidth — on
the server; that is deferred, not designed here.

Downloading is one-shot and explicit. The stored copy never refreshes, and the
originating address is not retained, so an image that changes or disappears
upstream leaves the workspace copy untouched. Remote images inside note bodies
remain blocked.
