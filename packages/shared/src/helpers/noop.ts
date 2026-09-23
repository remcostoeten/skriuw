/**
 * Intentionally does nothing. Use where a callback is required but the
 * behavior is "ignore this".
 *
 * @returns Undefined. Arguments supplied by a callback caller are ignored.
 *
 * @example
 * ```ts
 * import { noop } from "@skriuw/shared/helpers/noop";
 *
 * persistSettings(payload).catch(noop);
 * ```
 */
export function noop(): void {}
