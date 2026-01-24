import { encryptSecret, decryptSecret } from "@/lib/crypto/secret"

export function encryptPrompt(plainText: string): string {
    return encryptSecret(plainText)
}

export function decryptPrompt(encrypted: string): string {
    return decryptSecret(encrypted)
}

/**
 * Lightweight non-cryptographic hash for prompt deduplication and analytics only.
 * NOT suitable for security, privacy, or abuse-detection purposes due to
 * small output space and high collision probability.
 */
export function hashPrompt(prompt: string): string {
    let hash = 0
    for (let i = 0; i < prompt.length; i++) {
        const char = prompt.charCodeAt(i)
        hash = ((hash << 5) - hash + char) | 0
    }
    return hash.toString(16)
}
