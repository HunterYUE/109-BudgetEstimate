import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 模块加载副作用防护：pool.ts 要求 DB_PASSWORD/DB_PORT，auth.ts 要求 JWT_SECRET ≥ 32。
    // 测试只调用纯函数/签名验签，pg.Pool 惰性建连——env 只是让模块能加载，不会真正连接数据库。
    env: {
      DB_PASSWORD: 'test-no-connect',
      DB_PORT: '5432',
      JWT_SECRET: 'vitest-only-secret-0123456789abcdef0123456789',
    },
  },
});
