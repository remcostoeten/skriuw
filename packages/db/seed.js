#!/usr/bin/env node

/**
 * Database seed script entry point
 * 
 * Usage:
 *   pnpm seed          - Seed database (skips if data exists)
 *   pnpm seed --force  - Force seed (clears and re-seeds)
 *   pnpm seed --clear  - Clear database only
 * 
 * Note: This file is executed after build, importing from dist/
 */

import { seedDatabase, clearDatabase } from './dist/seed.js'

const args = process.argv.slice(2)
const force = args.includes('--force') || args.includes('-f')
const clear = args.includes('--clear') || args.includes('-c')

async function main() {
	try {
		if (clear) {
			await clearDatabase()
			if (!force) {
				console.log('💡 Add --force to seed after clearing')
				return
			}
		}

		if (force) {
			if (!clear) {
				await clearDatabase()
			}
			await seedDatabase()
		} else {
			await seedDatabase()
		}
	} catch (error) {
		console.error('Seed failed:', error)
		process.exit(1)
	}
}

main()

