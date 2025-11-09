/**
 * Generate a cryptographically strong unique identifier.
 *
 * Uses the Web Crypto API's `crypto.randomUUID()` to produce a RFC 4122
 * version 4 UUID string.
 *
 * @returns {string} A UUID v4 string (e.g., `550e8400-e29b-41d4-a716-446655440000`).
 */
export function generateId(): string {
    return crypto.randomUUID();
}
