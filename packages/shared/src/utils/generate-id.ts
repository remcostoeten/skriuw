/**
 * Generates a unique identifier string with an optional prefix.
 * 
 * Creates a random alphanumeric ID using timestamp and random values.
 * The generated ID is URL-safe and suitable for use as DOM element IDs,
 * database keys, or temporary unique identifiers.
 * 
 * Note: This is not cryptographically secure. For security-sensitive
 * applications, use crypto.randomUUID() or a dedicated library.
 * 
 * @param {string} [prefix=''] - Optional prefix to prepend to the generated ID
 * 
 * @example
 * ```ts
 * const userId = generateId();
 * ```
 * 
 * @example
 * ```ts
 * const elementId = generateId('button-');
 * ```
 * 
 * @returns {string} A unique identifier string with optional prefix
 */
export function generateId(prefix: string = ''): string {
    return `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}