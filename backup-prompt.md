# Feature Implementation: Import/Export Wizard & Format Transformers

## 1. Deep Dive Architecture Audit
-   **Current State**:
    -   `drivers/*` are correctly implemented for binary chunk transfer (S3, Dropbox, GDrive).
    -   `ImportPanel` is a monolithic component found in `apps/web/features/backup/components/import-panel.tsx`. **Goal**: Refactor this to host the new `MigrationWizard`.
    -   **Missing**: Logical layer to transform *Content*. Currently, backups are just raw JSON dumps. We cannot "Export to Markdown" because we lack a `BlockNoteJSON -> Markdown` mapper.
-   **Risk**: Users importing from Notion will upload a ZIP of Markdown files. Our system must recursively parse this folder structure and convert MD -> BlockNote JSON on the fly.
-   **Edge Cases**:
    -   **Images**: Notion exports images in a subfolder. The import logic must upload these to our asset system (`api/assets` or `uploadthing`).
    -   **Large Imports**: Importing 1,000 notes synchronously will crash the browser. Need `p-limit` or chunked processing.
    -   **Conflicts**: What if "Personal/Goals" exists? Strategy options: *Skip*, *Replace*, *Keep Both (Renamed)*.

## 2. Objective
Create a unified **"Data Migration Wizard"** that handles:
1.  **Format Transformation**: BlockNoteJSON <-> Markdown/PDF.
2.  **Platform Integration**: Import directly from Notion/Obsidian exports.
3.  **Conflict Resolution**: UI to handle duplicate items.
4.  **Asset Handling**: Re-uploading local assets during import.

## 3. Detailed Implementation Specs

### A. The Transformer Layer (`features/backup/transformers`)
Create pure functions to handle conversion. Note: These functions should NOT perform side effects (like uploads). They should return a description of assets that *need* uploading.

**Dependencies**:
- Install `jszip` for handling exports.
- Install `html2pdf.js` for PDF generation.
- Ensure `@blocknote/core` types are referenced.

**1. Markdown to BlockNote (`markdown-to-blocks.ts`)**
-   Input: Raw Markdown string.
-   Output: `Block[]` (BlockNote schema).
-   **Requirements**:
    -   Handle Headers (# -> heading).
    -   Handle Lists (- -> bulletListItem).
    -   Handle Images (![] -> image block). *Crucial: If image source is local file path, mark it for upload.*

**2. BlockNote to Markdown (`blocks-to-markdown.ts`)**
-   Input: `Block[]`.
-   Output: Markdown string.
-   **Requirements**: Recursively traverse children. Indent nested lists.

**3. PDF Generation (`export-pdf.ts`)**
-   Strategy: Client-side using `html2pdf.js` or `react-to-print`.
-   Why: Server-side (Puppeteer) is too heavy for this MVP.
-   Implementation: Render the note to a hidden `div` with "Print Styles", then snapshot it.

### B. The Wizard UI (`features/backup/wizard/MigrationWizard.tsx`)
A controlled multi-step form:

**Step 1: Direction**
-   "Import into Skriuw" vs "Export from Skriuw".

**Step 2: Source/Format**
-   **Import**: "Notion Export (Zip)", "Obsidian Vault (Folder)", "Skriuw Backup (JSON)".
-   **Export**: "Markdown (Zip)", "PDF", "Skriuw Backup (JSON)".

**Step 3: Configuration (The "Edge Case" Step)**
-   **Conflict Strategy**: Radio buttons [Replace existing, Keep both, Skip].
-   **Asset Handling**: toggle "Upload local images to cloud" (defaults to true).

**Step 4: Progress**
-   Display individual file progress (e.g., "Processing 45/120: /Personal/Journal.md").
-   Cancel button (abort signal).

### C. Handling The "Notion Image" Edge Case (Async Pipeline)
The transformation must be a two-step process to assume "Pure" conversion:

1.  **Parse**: `markdownToBlocks(md)` returns `{ blocks: Block[], imagePaths: string[] }`.
2.  **Upload (Wizard Logic)**: 
    -   Iterate `imagePaths`.
    -   Find corresponding file in Zip.
    -   Upload via `useUpload`.
    -   Map `localPath -> remoteUrl`.
3.  **Replace**: Traverse `blocks` and replace `src` with `remoteUrl`.

*CRITICAL*: Do not try to upload *inside* the parser. Separating parsing from I/O prevents "async hell" in the recursive parser.

## 4. Work Checklist
-   [ ] Create `blocks-to-markdown.ts` and `markdown-to-blocks.ts` with unit tests.
-   [ ] Create `useMigration` hook to manage the state machine of the wizard.
-   [ ] Implement `MigrationWizard` UI component.
-   [ ] Implement "Recursive Zip Parser" (using `jszip`) to handle Notion exports without unzipping to disk (browser-compatible).
