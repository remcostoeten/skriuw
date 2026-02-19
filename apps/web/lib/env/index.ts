// ============================================================================
// @/lib/env — Unified Environment Configuration
// Moved from packages/env. Import server/client modules directly to avoid
// leaking server secrets to the client bundle.
//
// Server-side (API routes, server components):
//   import { env, database, auth, ai } from '@/lib/env/server'
//
// Client-side (React components):
//   import { env, getAppUrl } from '@/lib/env/client'
// ============================================================================

// Schemas (for custom validation)
export * from './schema'

// Validation utilities
export * from './validate'

// Note: Do NOT re-export from './server' or './client' here.
// Import those directly to ensure proper tree-shaking and to
// prevent server secrets from leaking into the client bundle.
