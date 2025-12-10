/**
 * No-operation function that does nothing and returns nothing.
 * 
 * Useful as a default callback, placeholder function, or when you need
 * to satisfy a function type requirement but don't need any behavior.
 * 
 * @example
 * ```ts
 * const onClick = isEnabled ? handleClick : noop;g
 * ```
 * 
 * @example
 * ```ts
 * function fetchData(onSuccess = noop, onError = noop) {
 *   // ...
 * }
 * ```
 * 
 * @returns {void}
 */
export function noop(): void { }