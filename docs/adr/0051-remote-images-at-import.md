# ADR-0051: Remote images download once at import, with consent

- Status: accepted
- Date: 2026-09-27
- Amends: [ADR-0023](0023-lossless-markdown-transfer.md), [ADR-0030](0030-remote-cover-download.md)

## Context

ADR-0023 keeps remote images in imported Markdown as blocked placeholders so
that opening a note can never fetch from the network. That holds for untrusted
notes, but READMEs and docs lean on remote images: a badge row imports as a
column of alt-text links. The image store also refused SVG outright, and most
badges are SVG.

## Decision

- **Import may download, notes still never fetch.** When a Markdown import
  links `https` images, the renderer settles a workspace setting,
  `remoteImportImages` (`ask`, `download`, `block`). On `ask` it prompts once;
  the answer is saved and can be changed in Settings, Data. Dismissing the
  prompt keeps the images blocked for that import and asks again next time.
- **The shell downloads, as for covers.** Each distinct URL goes through the
  existing `download_remote_media` command from ADR-0030 (https only, public
  addresses, pinned DNS, bounded redirects, 25 MB cap) and becomes an ordinary
  blob plus `image_ref`. The note keeps no live `src`, so the ADR-0023
  guarantee for opening notes is unchanged. A failed download stays a blocked
  placeholder and is counted in the import report. Link marks around the image
  survive the swap.
- **SVG is admitted when it is inert.** `skriuw-images` recognises SVG only when
  it is UTF-8 with an `<svg` root and contains no scripts, event-handler
  attributes, `foreignObject` or other embedded documents, DOCTYPE or entity
  declarations, stylesheet imports, `javascript:` URLs, or external `http(s)`
  references, up to 2 MB. Anything else stays unsupported. The browser sniffer
  mirrors the rule in `apps/workspace/src/bridge/inert-svg.ts`.

## Consequences

Downloaded copies never refresh and do not record their origin, as with covers.
The browser runtime cannot fetch arbitrary hosts, so it skips the prompt and
keeps remote images blocked. The rule-based SVG check is deliberately strict: a
badge with an external logo reference stays blocked rather than being rewritten.
