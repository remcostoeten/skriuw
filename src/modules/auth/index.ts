/**
 * Mock Authentication Module
 * 
 * This module provides a mock authentication layer for development.
 * When Better Auth is integrated, only this module needs to be replaced.
 */

export type User = {
  id: string;
  email: string;
  name: string;
};

const DEMO_USER: User = {
  id: 'user_demo',
  email: 'demo@example.com',
  name: 'Demo User',
};

/**
 * Get the current authenticated user, or null if not authenticated.
 * In mock mode, always returns the demo user.
 */
export function getAuth(): User | null {
  return DEMO_USER;
}

/**
 * Require an authenticated user. Throws if not authenticated.
 * In mock mode, always returns the demo user.
 */
export function requireUser(): User {
  const user = getAuth();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Check if a user is authenticated.
 * In mock mode, always returns true.
 */
export function isAuthenticated(): boolean {
  return getAuth() !== null;
}
