import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must come last: disables any ESLint stylistic rules that would
      // conflict with Prettier's formatting.
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `any` is widely used in this codebase for legacy reasons (API response
      // shapes, drag handlers, recharts payloads). Downgrade to warn so it
      // stays visible without blocking CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow `_`-prefixed identifiers and ignore unused catch params entirely
      // (we frequently write `} catch { ... }` or `} catch (_err) { ... }`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    // shadcn-generated UI primitives intentionally co-export utility hooks,
    // variants, and constants alongside the component. The react-refresh
    // restriction doesn't apply because we don't HMR these files in practice.
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
