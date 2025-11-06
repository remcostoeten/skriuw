# InstantDB Seeder Tool

Interactive CLI tool for seeding notes into InstantDB.

## Features

- Interactive prompts for all note fields
- Support for markdown content from files or direct input
- Dutch date format (dd-mm-yyyy) for creation dates
- Pinned notes (position 0)
- Custom positioning or automatic end-of-list placement
- Folder support with nesting
- Task linking

## Usage

From the monorepo root:

```bash
bun run tools/seeder/src/index.ts
```

Or from the seeder directory:

```bash
cd tools/seeder
bun run start
```

## Environment

Requires `NEXT_PUBLIC_INSTANT_APP_ID` in your `.env` file.

## Workflow

1. Enter note title
2. Enter creation date (dd-mm-yyyy format)
3. Choose content source (file or paste)
4. Set pinned status
5. Choose folder (if not pinned)
6. Set position (custom or auto)
7. Link tasks (optional)

