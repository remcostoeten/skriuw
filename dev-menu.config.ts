import { defineConfig } from '@remcostoeten/dev-menu'

export default defineConfig({
	processes: [
		{
			tag: 'tauri',
			color: '33',
			cmd: 'bun',
			args: ['run', 'tauri', 'dev'],
			cwd: 'app',
			url: 'http://localhost:5183',
			port: 5183,
			openKey: 't',
		},
	],
	links: [{ label: 'e2e harness', url: 'http://localhost:5183/e2e/index.html', openKey: 'e' }],
	scripts: [
		{ label: 'check', cmd: './scripts/check.sh', key: 'c' },
		{ label: 'generate contracts', cmd: './scripts/generate.sh', key: 'g' },
		{ label: 'init dev db', cmd: './scripts/dev-db.sh' },
		{ label: 'renderer tests', cmd: 'bun', args: ['--cwd=app', 'run', 'test'] },
		{ label: 'typecheck', cmd: 'bun', args: ['--cwd=app', 'run', 'typecheck'] },
	],
	errorPatterns: {
		header: [/^error\[E\d+\]/, /^\s*thread '[^']*' panicked at/],
	},
	guardedPaths: ['app/src/', 'crates/', 'contracts/', 'migrations/'],
})
