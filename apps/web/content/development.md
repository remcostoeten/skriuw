# Development Flags

Skriuw exposes a small set of development flags to help with debugging authentication flows and observing visitor tracking.

## Zero-session tracking

Every visitor now receives a "zero session" identifier that is stored in a cookie/localStorage to support anonymous analytics without logging them in. The identifier is created client-side, so there is no flag to enable it—it always runs.

## Auth logging

### `NEXT_PUBLIC_ENABLE_AUTH_LOGGING`
Enables detailed console logging for authentication operations and zero-session lifecycle.

**Usage:**
```bash
# In .env.local
NEXT_PUBLIC_ENABLE_AUTH_LOGGING=true
```

**What it logs:**
- Session state changes (session, isPending, error)
- Auto-sign-in attempts
- Auto-sign-in disabled messages

### Example Configuration

Create or update `.env.local`:

```bash
# Enable auth logging
NEXT_PUBLIC_ENABLE_AUTH_LOGGING=true
```

### Implementation

Flags are read from `process.env` inside `/components/auth/auto-sign-in.tsx`.

**Note:** After changing environment variables, you must restart the Next.js development server.
