const { FlatCompat } = require('@eslint/eslintrc')
const base = require('@skriuw/config/eslint/base')

const compat = new FlatCompat({ baseDirectory: __dirname })

module.exports = [
	{
		ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**']
	},
	...compat.config(base)
]
