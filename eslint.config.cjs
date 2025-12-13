const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({ baseDirectory: __dirname })

module.exports = [
	{
		ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**']
	},
	...compat.extends('@skriuw/config/eslint/base')
]
