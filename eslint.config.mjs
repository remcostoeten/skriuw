import nextVitals from 'eslint-config-next/core-web-vitals.js'
import nextTs from 'eslint-config-next/typescript.js'
import pluginImport from 'eslint-plugin-import'
import pluginPrettier from 'eslint-plugin-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: 'custom-rules',
    plugins: {
      import: pluginImport,
      prettier: pluginPrettier
    },
    rules: {
      // Prettier as ESLint rule – keep in sync with .prettierrc
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          semi: false,
          trailingComma: 'none',
          tabWidth: 4,
          useTabs: false,
          arrowParens: 'avoid',
          endOfLine: 'lf'
        }
      ],

      // Style
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'never'],
      'comma-dangle': ['error', 'never'],
      indent: ['error', 4, { SwitchCase: 1 }],
      'no-multi-spaces': 'error',

      // Prefer function declarations over arrow where possible
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],

      // Imports – logical aesthetic ordering
      'import/order': [
        'error',
        {
          groups: [
            ['builtin', 'external'],
            ['internal'],
            ['parent', 'sibling', 'index'],
            ['object', 'type']
          ],
          pathGroups: [
            { pattern: '@/**', group: 'internal', position: 'before' }
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true, orderImportKind: 'asc' }
        }
      ],
      'import/newline-after-import': 'error'
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts'
  ])
])

export default eslintConfig
