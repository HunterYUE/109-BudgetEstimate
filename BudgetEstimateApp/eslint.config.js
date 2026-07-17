import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/** 自定义规则：禁止直接 fetch() 绕过 api.ts */
const noDirectFetchRule = {
  meta: {
    type: 'suggestion',
    docs: { description: '禁止直接 fetch()——必须通过 api.ts 或手动 toCamel()' },
    messages: {
      noFetch: '直接 fetch() 绕过 api.ts。请使用 api.get/post/put/delete，或手动 toCamel()/toSnake() 并注明原因。（详见 memory/naming-convention-standard.md）',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
          context.report({ node, messageId: 'noFetch' });
        }
      },
    };
  },
};

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'no-direct-fetch': { rules: { 'no-fetch': noDirectFetchRule } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-direct-fetch/no-fetch': 'warn',
    },
  },
  // 例外：api.ts（客户端自身）和 authContext（认证流程，发生在 token 获取前）
  {
    files: ['**/utils/api.ts', '**/utils/authContext.tsx'],
    rules: {
      'no-direct-fetch/no-fetch': 'off',
    },
  },
])
