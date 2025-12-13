import { env } from './env'

/**
 * Check if a user email is an admin
 * ADMIN_EMAILS in env should be comma-separated list of admin emails
 */
export function isAdmin(userEmail: string | null | undefined): boolean {
    if (!userEmail) return false
    const adminEmails = env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) ?? []
    return adminEmails.includes(userEmail.toLowerCase())
}
