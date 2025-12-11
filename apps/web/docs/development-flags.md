# Development Flags

## Auto Sign-In Control

The application includes development flags to control auto-sign-in behavior and enable detailed logging for debugging.

### Available Flags

#### `NEXT_PUBLIC_DISABLE_AUTO_SIGNIN`
Disables automatic anonymous user sign-in on app load.

**Usage:**
```bash
# In .env.local
NEXT_PUBLIC_DISABLE_AUTO_SIGNIN=true
```

**When to use:**
- Debugging authentication flows
- Testing without automatic session creation
- Development scenarios where you want manual control

#### `NEXT_PUBLIC_ENABLE_AUTH_LOGGING`
Enables detailed console logging for authentication operations.

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
# Disable auto-sign-in for debugging
NEXT_PUBLIC_DISABLE_AUTO_SIGNIN=true

# Enable auth logging
NEXT_PUBLIC_ENABLE_AUTH_LOGGING=true
```

### Implementation

Flags are defined in `/components/auth/auto-sign-in.tsx`:

```typescript
const DEV_FLAGS = {
  DISABLE_AUTO_SIGNIN: process.env.NEXT_PUBLIC_DISABLE_AUTO_SIGNIN === 'true',
  ENABLE_AUTH_LOGGING: process.env.NEXT_PUBLIC_ENABLE_AUTH_LOGGING === 'true',
}
```

**Note:** After changing environment variables, you must restart the Next.js development server.
