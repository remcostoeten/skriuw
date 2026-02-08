import { spawn } from 'node:child_process'

const webDir = new URL('../../../apps/web', import.meta.url).pathname

async function main() {
	const proc = spawn('bun', ['--env-file=../../.env.local', 'scripts/sync-seeds.ts'], {
		cwd: webDir,
		stdio: 'inherit'
	})

	const exitCode = await new Promise<number>((resolve, reject) => {
		proc.on('close', (code) => resolve(code ?? 1))
		proc.on('error', reject)
	})
	process.exit(exitCode)
}

main().catch((error) => {
	console.error('Failed to run seed sync via apps/web script:', error)
	process.exit(1)
})
