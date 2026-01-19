import { getDatabase, notes } from '@skriuw/db'
import { eq } from 'drizzle-orm'
import { identityGuardNoteContent } from './seed-content/identity-guard-content'

export async function seedUserWithIdentityGuide(userId: string): Promise<boolean> {
  return true
}

export async function userHasIdentityGuide(userId: string): Promise<boolean> {
  return false
}