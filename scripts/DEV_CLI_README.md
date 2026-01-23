# Skriuw Dev CLI

Professional CLI tool for Skriuw development operations. Allows triggering dev API actions with dry-run support, database snapshots, and detailed logging.

## Installation

The CLI is bundled with the Skriuw monorepo. No additional installation is needed.

## Usage

```bash
bun run scripts/dev-cli.ts <action> [options]
```

Or use the convenience alias:

```bash
bun run dev-cli <action> [options]
```

## Actions

| Action            | Description                              |
| ----------------- | ---------------------------------------- |
| `seed`            | Create sample data (notes and folders)   |
| `clear-all`       | Delete all data from all tables          |
| `clear-notes`     | Delete all notes                         |
| `clear-settings`  | Delete all settings                      |
| `clear-shortcuts` | Delete all shortcuts                     |
| `stats`           | Show database statistics                 |
| `ping-db`         | Test database connection                 |
| `check-schema`    | Check schema synchronization             |
| `push-schema`     | Push schema changes                      |
| `reset-database`  | Reset entire database                    |
| `auth`            | Extract auth tokens from browser session |

## Options

| Option                   | Short | Description                                          | Default         |
| ------------------------ | ----- | ---------------------------------------------------- | --------------- |
| `--user <userId>`        | `-u`  | Target specific user ID                              | current session |
| `--dry-run`              | `-d`  | Preview changes without executing                    | false           |
| `--output <format>`      | `-o`  | Output format (json, text, markdown)                 | text            |
| `--log-file <path>`      | `-l`  | Custom log file path                                 | auto-generated  |
| `--snapshot`             | `-s`  | Capture pre/post database snapshots                  | false           |
| `--tables <tables>`      | `-t`  | Tables to snapshot (comma-separated)                 | all tables      |
| `--verbose`              | `-v`  | Verbose output                                       | false           |
| `--auth-tokens <tokens>` |       | Use pre-existing auth cookies                        | none            |
| `--browser <browser>`    | `-b`  | Browser for auth extraction (brave, chrome, firefox) | brave           |
| `--port <port>`          | `-p`  | Dev server port                                      | 3000            |

## Examples

### Dry run before executing

```bash
# Preview what seed would do
bun run dev-cli seed --dry-run --snapshot

# Preview what clear-all would do
bun run dev-cli clear-all --dry-run --snapshot
```

### Execute with logging

```bash
# Seed data and capture snapshots
bun run dev-cli seed --snapshot

# Clear all data with JSON output
bun run dev-cli clear-all --output json --snapshot
```

### Get statistics

```bash
# Show database stats
bun run dev-cli stats

# Verbose stats output
bun run dev-cli stats --verbose
```

### Extract auth tokens from browser

```bash
# Open browser and extract tokens
bun run dev-cli auth --browser brave

# Or specify port
bun run dev-cli auth --browser chrome --port 3000
```

### Use extracted auth tokens

```bash
# Execute action as specific user
bun run dev-cli seed --user "user-123" --auth-tokens '{"cookies": {...}, "localStorage": {...}}'
```

## Auth Token Extraction

The CLI provides two methods for authenticating as a specific user:

### Method 1: Browser Console (Recommended)

1. Run `bun run dev-cli auth --browser brave`
2. Browser opens to localhost:3000
3. Log in to the application
4. Open DevTools (F12) and paste the provided script
5. Tokens are copied to clipboard
6. Run CLI command with `--auth-tokens <pasted-tokens>`

### Method 2: Manual Token Extraction

Open browser DevTools on localhost:3000 and run:

```javascript
const cookies = document.cookie.split(';').reduce((acc, cookie) => {
	const [key, value] = cookie.trim().split('=')
	acc[key] = value
	return acc
}, {})

const authData = {
	cookies: cookies,
	localStorage: {
		better_auth_session: localStorage.getItem('better_auth_session'),
		better_auth_session_token: localStorage.getItem('better_auth_session_token')
	},
	sessionStorage: {
		better_auth_session: sessionStorage.getItem('better_auth_session')
	}
}

console.log(JSON.stringify(authData))
```

Then use the output with `--auth-tokens`.

## Output Formats

### Text (Default)

Professional text format with ASCII separators.

### JSON

Machine-readable JSON format with all data:

```json
{
  "timestamp": "2025-12-26T02:37:18.144Z",
  "action": "seed",
  "dryRun": false,
  "targetUser": "current",
  "duration": "125ms",
  "preSnapshot": { ... },
  "postSnapshot": { ... },
  "response": { ... },
  "differences": { ... }
}
```

### Markdown

Formatted as Markdown report with tables for snapshots and differences.

## Database Snapshots

When using `--snapshot`, the CLI captures pre and post database states:

```bash
bun run dev-cli seed --snapshot --tables notes,folders
```

This will:

1. Capture current state of notes and folders tables
2. Execute the action
3. Capture new state
4. Calculate and display differences
5. Include all snapshot data in the log file

## Log Files

All executions are logged to `logs/dev-cli/` with timestamp-based filenames:

```
logs/dev-cli/dev-cli-2025-12-26T02-37-18-145Z.log
```

Use `--log-file` to specify a custom path:

```bash
bun run dev-cli seed --log-file my-custom-log.txt
```

## Development Mode

In development mode, the CLI bypasses authentication and works directly with the dev API endpoints.

For production-like testing with real authentication:

1. Use `--auth-tokens` with extracted session data
2. Or use `--user <userId>` with a valid session cookie

## Troubleshooting

### Browser not found

If you get a "Browser not found" error:

- Verify browser is installed
- Use `--browser` to specify a different browser
- Check supported browsers: brave, chrome, firefox

### Database connection errors

Ensure dev server is running:

```bash
bun run dev
```

### Permission errors

Dev API endpoints are restricted to admins in production. In development mode, this restriction is bypassed.

### Dry-run shows wrong preview

Some actions may not have detailed dry-run previews. The preview indicates what would happen without actually executing.
