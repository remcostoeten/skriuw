/**
 * Buffer polyfill for browser
 * Must be imported before any code that uses Buffer (like postgres client)
 */
import { Buffer } from "buffer";

// Make Buffer available globally
if (typeof globalThis.Buffer === "undefined") {
        (globalThis as any).Buffer = Buffer;
}

export { Buffer };


