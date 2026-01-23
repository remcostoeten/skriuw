# Development Flags

Skriuw uses a unified debug system controlled by environment variables.

## Quick Start

Set in `.env.local`:

```bash
# Enable all debug features
NEXT_PUBLIC_DEBUG=true

# Or enable specific features
NEXT_PUBLIC_DEBUG=auth,shortcuts,network
```

## Available Flags

| Flag           | Description                                    |
| -------------- | ---------------------------------------------- |
| `auth`         | Auth operations + demo mode (infinite loading) |
| `shortcuts`    | Keyboard shortcut logging                      |
| `network`      | Network request logging                        |
| `perf`         | Performance monitoring                         |
| `render`       | Component render tracking                      |
| `state`        | State change logging                           |
| `general`      | General/misc logging                           |
| `all` / `true` | Enable everything                              |

## Usage in Code

```ts
import { debug, logger } from '@/lib/debug'

// Check if enabled
if (debug.isEnabled('auth')) { ... }

// Get config object
const { authDemoMode } = debug.config()

// Simple logging
debug.log('auth', 'User signed in', { userId })

// Styled logging
logger.info('auth', 'Session created')
logger.warn('network', 'Slow request', { ms: 500 })
```

## Legacy Support

These still work:

- `NEXT_PUBLIC_ENABLE_AUTH_LOGGING=true`
- `NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING=true`
- `NEXT_PUBLIC_ENABLE_GENERAL_LOGGING=true`

**Note:** Restart the dev server after changing env vars.
