const tsPlugin = require('@typescript-eslint/eslint-plugin')

module.exports = [
	{
		ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**']
	},
	...tsPlugin.configs['flat/recommended']
]
