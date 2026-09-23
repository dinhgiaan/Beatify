// Cấu hình ESLint (flat config) dùng chung cho cả monorepo
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.expo/**',
    '**/.wrangler/**',
    '**/ios/**',
    '**/android/**',
    'fixtures/music/**',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      // AGENTS.md: không dùng any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
