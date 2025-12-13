const { FlatCompat } = require('@eslint/eslintrc')
const js = require('@eslint/js')
const base = require('@skriuw/config/eslint/base')

const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
})

module.exports = [
	{
		ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**']
	},
	...compat.config(base)
]
