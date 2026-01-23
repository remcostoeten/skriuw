const { resolve } = require('node:path')

const project = resolve(process.cwd(), 'tsconfig.json')

/** @type {import("eslint").Linter.Config} */
module.exports = {
	extends: [
		'eslint:recommended',
		'@typescript-eslint/recommended',
		'plugin:react/recommended',
		'plugin:react-hooks/recommended',
		'prettier'
	],
	plugins: ['@typescript-eslint', 'react', 'react-hooks'],
	globals: {
		React: true,
		JSX: true
	},
	env: {
		browser: true,
		node: true
	},
	settings: {
		react: {
			version: 'detect'
		},
		'import/resolver': {
			typescript: {
				project
			}
		}
	},
	ignorePatterns: [
		// Ignore dotfiles
		'.*.js',
		'node_modules/',
		'dist/'
	],
	overrides: [
		{
			files: ['*.js?(x)', '*.ts?(x)']
		}
	]
}
