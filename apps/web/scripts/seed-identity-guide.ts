		#!/usr/bin / env bun

/**
 * CLI script to seed the Identity Guard knowledge note to all users
 * Usage: bun run scripts/seed-identity-guide.ts
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function seedIdentityGuideToAllUsers() {
	console.log('🌱 Seeding Identity Guard knowledge to all users...')
	console.log(`📡 Making request to: ${APP_URL}/api/admin/seed-identity-guide`)

	try {
		const response = await fetch(`${APP_URL}/api/admin/seed-identity-guide`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		const result = await response.json()

		if (result.success) {
			console.log('\n✅ Identity Guard seeding completed successfully!')
			console.log('\n📊 Results:')
			console.log(result.summary || 'No summary provided')
		} else {
			console.log('\n⚠️  Seeding completed with some errors:')
			console.log(result.message)
			if (result.data?.errors?.length > 0) {
				console.log('\n❌ Errors:')
				result.data.errors.forEach((error: string) => {
					console.log(`  - ${error}`)
				})
			}
		}
	} catch (error) {
		console.error('\n❌ Failed to seed Identity Guard knowledge:')
		console.error(error instanceof Error ? error.message : 'Unknown error')
		process.exit(1)
	}
}

async function getSeedingStats() {
	console.log('📈 Getting Identity Guard seeding statistics...')
	console.log(`📡 Making request to: ${APP_URL}/api/admin/seed-identity-guide`)

	try {
		const response = await fetch(`${APP_URL}/api/admin/seed-identity-guide`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		const stats = await response.json()

		console.log('\n📊 Identity Guard Seeding Statistics:')
		console.log(`👥 Total users: ${stats.totalUsers}`)
		console.log(`📚 Users with Identity Guard note: ${stats.usersWithIdentityGuardNote}`)
		console.log(`📝 Total Identity Guard notes: ${stats.totalIdentityGuardNotes}`)

		if (stats.notes && stats.notes.length > 0) {
			console.log('\n📝 Identity Guard Notes:')
			stats.notes.forEach((note: any) => {
				const status = []
				if (note.isPinned) status.push('📌 Pinned')
				if (note.isFavorite) status.push('⭐ Favorite')

				console.log(
					`  - ${note.userEmail || note.userName || 'Unknown'} (${note.isAnonymous ? 'Anonymous' : 'Authenticated'}) ${status.join(', ')}`
				)
			})
		}
	} catch (error) {
		console.error('\n❌ Failed to get statistics:')
		console.error(error instanceof Error ? error.message : 'Unknown error')
		process.exit(1)
	}
}

// CLI argument handling
const command = process.argv[2]

if (command === 'stats') {
	await getSeedingStats()
} else if (command === 'seed' || !command) {
	await seedIdentityGuideToAllUsers()
} else {
	console.log('Usage:')
	console.log('  bun run scripts/seed-identity-guide.ts [seed|stats]')
	console.log('')
	console.log('Commands:')
	console.log('  seed  - Seed Identity Guard knowledge to all users (default)')
	console.log('  stats - Show seeding statistics')
	process.exit(1)
}

export { }
