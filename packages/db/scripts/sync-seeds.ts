import { spawn } from 'bun'

const webDir = new URL('../../../apps/web', import.meta.url).pathname

async function main() {
	const proc = spawn(['bun', '--env-file=../../.env.local', 'scripts/sync-seeds.ts'], {
		cwd: webDir,
		stdout: 'inherit',
		stderr: 'inherit'
	})

	const exitCode = await proc.exited
	process.exit(exitCode)
}

main().catch((error) => {
	console.error('Failed to run seed sync via apps/web script:', error)
	process.exit(1)
})
