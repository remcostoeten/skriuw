/**
 * Process polyfill for browser
 * Must be imported before any code that uses process (like postgres client)
 * Maps import.meta.env to process.env for compatibility with Node.js libraries
 */
if (typeof globalThis.process === "undefined") {
        // Create a proxy that maps to import.meta.env for Vite environment variables
        const envProxy = new Proxy({} as Record<string, string | undefined>, {
                get(_target, prop: string | symbol) {
                        // Handle special cases
                        if (prop === "toString") {
                                return () => "[object Object]";
                        }
                        if (prop === "valueOf") {
                                return () => envProxy;
                        }
                        if (typeof prop === "symbol") {
                                return undefined;
                        }

                        // Try to get from import.meta.env first (Vite convention)
                        if (typeof import.meta !== "undefined" && import.meta.env) {
                                const viteKey = `VITE_${prop}`;
                                if (import.meta.env[viteKey] !== undefined) {
                                        return import.meta.env[viteKey];
                                }
                                // Also check without VITE_ prefix for direct access
                                if (import.meta.env[prop] !== undefined) {
                                        return import.meta.env[prop];
                                }
                        }
                        return undefined;
                },
                has(_target, prop: string) {
                        if (typeof import.meta !== "undefined" && import.meta.env) {
                                const viteKey = `VITE_${prop}`;
                                return viteKey in import.meta.env || prop in import.meta.env;
                        }
                        return false;
                },
                ownKeys(_target) {
                        // Return empty array for Object.keys() calls
                        return [];
                },
                getOwnPropertyDescriptor(_target, prop: string) {
                        return {
                                enumerable: true,
                                configurable: true,
                                value: envProxy[prop],
                        };
                },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).process = {
                env: envProxy,
                version: "",
                versions: {},
                platform: "browser",
                nextTick: (fn: () => void) => setTimeout(fn, 0),
        };
}

export {};

