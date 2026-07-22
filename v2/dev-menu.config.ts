import { defineConfig } from '@remcostoeten/dev-menu'

export default defineConfig({
	processes: [
		{
			tag: 'tauri',
			color: '33',
			cmd: 'bash',
			args: ['-c', '../scripts/kill-port.sh 5183; exec pnpm tauri dev'],
			cwd: 'app',
			url: 'http://localhost:5183',
			port: 5183,
			openKey: 't',
		},
	],
	guardedPaths: ['app/src/', 'crates/'],
})
