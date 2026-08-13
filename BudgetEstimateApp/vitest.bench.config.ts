import { defineConfig } from 'vitest/config';

// 性能基准专用配置：只在 npm run bench 时跑（tests/bench/**/*.bench.ts），
// 不进默认 build 门禁（main vitest.config.js 的 include 只匹配 *.test.*）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/bench/**/*.bench.ts'],
    // 测量工具：console 输出直通 stdout（不被 vitest 拦截吞掉），便于查看/记录
    disableConsoleIntercept: true,
  },
});
