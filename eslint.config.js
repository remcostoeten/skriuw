import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
	js.configs.recommended,
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				ecmaFeatures: {
					jsx: true,
				},
				project: './tsconfig.json',
			},
			globals: {
				// Browser globals
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				alert: 'readonly',
				localStorage: 'readonly',
				sessionStorage: 'readonly',
				// Node.js globals (for setTimeout, clearTimeout, etc.)
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				NodeJS: 'readonly',
				// React globals (for JSX transform)
				React: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
			react,
			'react-hooks': reactHooks,
			import: importPlugin,
			'unused-imports': unusedImports,
		},
		settings: {
			react: {
				version: 'detect',
			},
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json',
				},
			},
		},
		rules: {
			// React rules
			'react/react-in-jsx-scope': 'off', // Not needed in React 17+
			'react/prop-types': 'off', // Using TypeScript for prop validation
			'react/display-name': 'off',
			'react/jsx-uses-react': 'off',
			'react/jsx-uses-vars': 'error',

			// React Hooks rules
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',

			// TypeScript rules - use unused-imports for better import handling
			'no-unused-vars': 'off', // Turn off base rule
			'@typescript-eslint/no-unused-vars': 'off', // Turn off TS rule, use unused-imports instead
			'unused-imports/no-unused-imports': 'error', // Remove unused imports
			'unused-imports/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					argsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn',

			// General JavaScript/TypeScript rules
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-debugger': 'warn',
			'prefer-const': 'warn',
			'no-var': 'error',
			'no-redeclare': 'off', // TypeScript handles this better
			'@typescript-eslint/no-redeclare': [
				'error',
				{
					ignoreDeclarationMerge: true, // Allow type + value with same name
				},
			],

			// Import rules - sorting and organization
			'import/order': [
				'error',
				{
					groups: [
						'builtin', // Node.js built-in modules
						'external', // External libraries
						'internal', // Internal modules (using @ alias)
						'parent', // Parent imports
						'sibling', // Sibling imports
						'index', // Index imports
						'type', // Type imports
					],
					pathGroups: [
						// Group shared utilities first
						{
							pattern: '@/shared/utilities/**',
							group: 'internal',
							position: 'before',
						},
						// Group shared UI components
						{
							pattern: '@/shared/ui/**',
							group: 'internal',
							position: 'before',
						},
						// Group shared types
						{
							pattern: '@/shared/**',
							group: 'internal',
							position: 'before',
						},
						// Group app-level code
						{
							pattern: '@/app/**',
							group: 'internal',
							position: 'before',
						},
						// Group features
						{
							pattern: '@/features/**',
							group: 'internal',
							position: 'before',
						},
						// Group components
						{
							pattern: '@/components/**',
							group: 'internal',
							position: 'before',
						},
						// Group hooks
						{
							pattern: '@/hooks/**',
							group: 'internal',
							position: 'before',
						},
						// Group pages
						{
							pattern: '@/pages/**',
							group: 'internal',
							position: 'before',
						},
						// Group API
						{
							pattern: '@/api/**',
							group: 'internal',
							position: 'before',
						},
					],
					pathGroupsExcludedImportTypes: ['type'],
					'newlines-between': 'always',
					alphabetize: {
						order: 'asc',
						caseInsensitive: true,
					},
				},
			],
			'import/no-unresolved': 'error',
			'import/no-duplicates': 'error',
			'import/no-unused-modules': 'off', // Can be slow on large projects
		},
	},
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'build/**',
			'.next/**',
			'coverage/**',
			'*.config.js',
			'*.config.ts',
			],
	},
]

