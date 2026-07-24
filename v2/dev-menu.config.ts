import { defineConfig } from '@remcostoeten/dev-menu'

export default defineConfig({
	processes: [
		{
			tag: 'tauri',
			color: '33',
			cmd: 'pnpm',
			args: ['tauri', 'dev'],
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
		{ label: 'renderer tests', cmd: 'pnpm', args: ['-C', 'app', 'test'] },
		{ label: 'typecheck', cmd: 'pnpm', args: ['-C', 'app', 'typecheck'] },
	],
	errorPatterns: {
		header: [/^error\[E\d+\]/, /^\s*thread '[^']*' panicked at/],
	},
	guardedPaths: ['app/src/', 'crates/', 'contracts/', 'migrations/'],
})
