/**
 * A no-operation function that accepts any arguments and returns void.
 * Useful as a default callback, stub, or placeholder to avoid nullable checks.
 *
 * @example
 * const onClick = disabled ? noop : handleClick;
 */
export function noop(..._: unknown[]): void { }
