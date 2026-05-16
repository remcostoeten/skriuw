export const SCOPES = {
  global: 'global',
  userMenu: 'user-menu',
} as const

export type Scope = (typeof SCOPES)[keyof typeof SCOPES]

export const DEFAULT_ACTIVE_SCOPES: Scope[] = [SCOPES.global]