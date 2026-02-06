import { defineConfig } from 'tsup'

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		'types/index': 'src/types/index.ts',
		'errors/index': 'src/errors/index.ts',
		'cache/index': 'src/cache/index.ts',
		'adapter/index': 'src/adapter/index.ts',
		'operations/index': 'src/operations/index.ts'
	},
	format: ['esm'],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: true
})
