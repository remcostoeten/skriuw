/**
 * A shared no-operation function.
 *
 * Use as the body of intentionally-empty `catch` blocks (and anywhere an
 * explicit "do nothing" callback is clearer than an empty arrow) so the intent
 * reads as deliberate rather than an accidental swallow.
 */
export function noop(): void {}
