# Feature Implementation: Full Asset Management System

## 1. Deep Dive Architecture Audit

- **Current State**:
    - `files` table exists in `packages/db/src/schema.ts` but is underutilized (mostly just UploadThing).
    - `POST /api/assets` exists but is manually called.
    - **Gap**:
        - **Orphans**: Deleting a note leaves images in the DB/Storage forever.
        - **Privacy**: Making a note "Public" does not automatically update the `isPublic` flag of its embedded assets.
        - **Quota**: No prevention of a user uploading 1TB of data.
- **Risk**:
    - **Data Leak**: A private image embedded in a public note might technically be accessible if the URL is guessed (UploadThing/S3 signed URLs mitigate this, but `isPublic` flag logic is weak).
    - **Storage Bloat**: Users will treat this as a Google Photos replacement if not capped.

## 2. Objective

Build a **Production-Grade Asset Library** that:

1.  **Unifies** all storage backends (S3, UploadThing, Local) under one UI.
2.  **Manages Lifecycle**: Track usage counts; warn on deleting used assets.
3.  **Enforces Quotas**: Limit storage per user (e.g., 1GB for free tier).

## 3. Detailed Implementation Specs

### A. The "Unified Upload" Hook (`features/uploads/use-upload-manager.ts`)

Wrap the existing `useUpload` to strictly enforce DB registration.

- **Flow**:
    1.  Check Quota (GET `/api/user/usage`).
    2.  Perform Upload (via `upload-adapter.ts`).
    3.  **Critical**: Call `POST /api/assets` immediately with `storageProvider` (s3/uploadthing/local).
    4.  Return standard `Asset` object.

### B. The Asset Library UI (`features/assets/AssetManager.tsx`)

A rigorous management interface.

- **Visuals**: Masonry grid for images, list for documents.
- **Filtering**: By type (Image/Video/File), Date, and _Usage Status_ (Used in 0 notes vs Used in X notes).
- **Usage Tracking**:
    - Implementation: A background cron or optimized SQL query that regex-matches `files.url` against `notes.content`.
    - _Simpler MVP_: When opening the Asset Manager, run a quick `SELECT id FROM notes WHERE content LIKE '%url%'` for the visible assets.

### C. Backend Lifecycle Logic (`api/assets/lifecycle`)

- **Recursive Deletion**:
    - When `DELETE /api/assets/:id` is called:
        1.  Check if used in any note. If yes -> Return 409 Conflict (require `force=true`).
        2.  Delete from DB.
        3.  Delete from S3/UploadThing (using `utapi.deleteFiles` or S3 SDK).
- **Orphan cleanup**:
    - Create a script/endpoint `api/cron/cleanup-assets` that finds files older than 24h with 0 usage and deletes them (optional, manual trigger for now).

### D. Privacy Propagation

- **Scenario**: User toggles Note from Private -> Public.
- **Action**: Loop through all image URLs in that note. Update matching `files` rows to `isPublic = true`.
- **Edge Case**: What if the image is used in _another_ private note?
    - _Decision_: If an asset is used in ANY public note, it is public.

## 4. Work Checklist

- [ ] **Schema**: Add `usageCount` (int, default 0) to `files` table for caching usage.
- [ ] **API**: Update `/api/assets` to handle `quota` checks and `usage` calculation.
- [ ] **UI**: Build `AssetManager` with "Delete" protection (confirmation dialog if used).
- [ ] **Integration**: Hook into `NoteSettings` -> `VisibilityToggle` to trigger privacy propagation.
