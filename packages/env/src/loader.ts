/**
 * @fileoverview Environment Loader
 * @description Automatically loads .env files before validation.
 * This ensures environment variables are available when @skriuw/env is imported.
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'

let loaded = false

/**
 * Find the monorepo root by looking for root-level indicators.
 * Walks up from the current directory until we find turbo.json, pnpm-workspace.yaml,
 * or a package.json with a "workspaces" field.
 */
function findProjectRoot(startDir: string = process.cwd()): string {
    let dir = startDir
    let depth = 0
    const maxDepth = 10 // Prevent infinite loops

    while (dir !== '/' && depth < maxDepth) {
        // Check for monorepo root indicators
        if (existsSync(resolve(dir, 'turbo.json'))) {
            return dir
        }
        if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
            return dir
        }
        // Check for root package.json with workspaces or packages folder
        if (existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, 'packages'))) {
            return dir
        }
        dir = dirname(dir)
        depth++
    }
    return startDir
}

/**
 * Load environment variables from .env files.
 * Searches for .env files in the project root.
 * Safe to call multiple times - only loads once.
 */
export function loadEnv(): void {
    if (loaded) return
    loaded = true

    const root = findProjectRoot()

    // Load in order of precedence (later files don't override earlier ones by default)
    // .env.local has highest priority
    const envFiles = [
        resolve(root, '.env.local'),
        resolve(root, '.env'),
    ]

    for (const file of envFiles) {
        if (existsSync(file)) {
            config({ path: file })
        }
    }
}

// Auto-load on import
loadEnv()
