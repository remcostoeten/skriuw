# ADR-0052: Public note links

- Status: accepted
- Date: 2026-09-27

## Context

Users want to send a note to someone who does not use Skriuw: a read-only page
on skriuw.com behind a link. Everything else Skriuw stores off the device is
either sync operations, which [ADR-0043](0043-end-to-end-encrypted-sync.md) can
encrypt end to end, or nothing at all. A page anyone can read has to be
plaintext on the server, so it cannot be derived from the sync log and must not
depend on sync being connected.

## Decision

- A share is a **plaintext snapshot the owner uploads on purpose**. The client
  serializes the note to Markdown (without the drawing layer) and sends it to
  `POST /v1/shares`; the Worker stores it in D1 table `note_share`. Sync, its
  encryption, and its Durable Objects are not involved. Sharing needs a signed-in
  account but never turns sync on.
- **One share per note.** Publishing again replaces the snapshot behind the same
  link. A link id is 128 random bits; nothing about the owner, note, or
  workspace is derivable from it or returned by the public read.
- The owner chooses per share between a **frozen snapshot**, republished with
  "Update shared copy", and a **live** share. Live shares are uploaded by the
  renderer after the note has been idle for five seconds, through
  `PUT /v1/shares/:id`, which updates and never creates. A background update
  that races "Stop sharing" therefore cannot bring a revoked link back.
- **Locked notes cannot be shared**, even while unlocked, and a live share whose
  note is locked later stops updating.
- The public page `skriuw.com/s/<id>/` is rendered by `apps/site` from
  `GET /shares/:id` on each request, so revoking takes effect on the next load.
  Shared Markdown is untrusted input on a first-party origin: raw HTML is
  escaped, links are limited to http(s) and mailto, and media, drawings, and
  any image the share does not store become placeholders. Pages are `noindex`
  and send no referrer.
- **Trashing a note stops sharing it**, as "Stop sharing" does. This covers a
  note trashed on its own and every shared note inside a trashed folder, on
  this device or synced from another one. The link leaves the share registry
  in the same tick; `DELETE /v1/shares/:id` runs in the background, so the
  trash action never waits on the network. Revokes the server has not
  confirmed are kept per account in local storage and retried with backoff,
  when the device comes back online, and on the next start, and a failed one
  raises a toast with a Retry action. Permanently deleting or emptying the
  trash needs no extra step, because the share was revoked when the note was
  trashed, and a still-pending revoke is retried by share id after the note is
  gone.
- **Restoring a note does not share it again.** Republishing silently would
  surprise the owner; sharing a restored note creates a new link.
- **Images are published with the note** (amended 2026-10-12). The client
  sends the PNG, JPEG, GIF, and WebP images the shared Markdown references as
  base64 in the same upload, up to 4 MB each, 20 per note, and 12 MB per note;
  others are left out rather than failing the share. The Worker accepts only
  those four types and checks each image's bytes against the declared type's
  signature, so nothing a browser could sniff as markup is stored. Images live
  in the Worker's existing R2 bucket under `note-shares/<share id>/images/`,
  so no D1 migration is needed and R2 is the only record of which images a
  share has. An image id never changes its bytes, so an upload refers to
  images the share already stores by id alone; the Worker answers
  `share_image_missing` when one is gone, and the client retries once with
  every image's bytes. New images are written before the D1 row and stale
  ones deleted after it, so a public read never references a missing image.
  Revoking a share, an update that drops an image, and account deletion
  delete the stored images.
- `GET /shares/:id` lists the stored image ids, and
  `GET /shares/:id/images/:imageId` serves one while the share exists, with
  the validated content type, `nosniff`, a `sandbox` content policy, and a
  one-year immutable cache. The site rewrites `images/<id>` to that URL.
- Limits: 512 KB of Markdown and 12 MB of images per note, and 500 shares
  per account.

## Consequences

- Shared text is readable by the server operator. The share dialog says so
  before the first upload.
- Shared images are readable by the server operator, like shared text. A
  viewer's browser may keep an image cached after the link is revoked.
- A share whose note this device has never seen is left alone, since the
  account's shares can come from any device. A note trashed and permanently
  deleted on a device that was signed out at the time keeps its link, because
  no device that signs in later still has the note to match it against.
- The account's share list is read from the server on sign-in, so live updates
  continue from any signed-in device.
