import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 纯业务函数单测骨架：测试放根级 tests/（不侵入 src/，规避 lint-naming 对 src 的 snake_case 扫描）。
// 环境用 node（被测函数均为纯计算，无 DOM 依赖）；需要 DOM 的用例后续再引入 jsdom。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx,js,jsx}'],
  },
})
