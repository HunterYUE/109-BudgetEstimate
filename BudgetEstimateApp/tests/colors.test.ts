import { describe, it, expect } from 'vitest';
import { COLORS } from '../src/styles/colors';

// 颜色常量守卫：内联样式与 SVG fill 直接消费 COLORS，空串/非法值会被 React 丢弃，
// 元素回退继承色（白底白字等“不可见”问题）。此测试锁定「每个值都是可用颜色」。
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_RE = /^(?:rgb|rgba|hsl|hsla|var)\(/i;

describe('COLORS 常量：不得出现空值或非法颜色', () => {
  it('所有颜色值均为十六进制（或函数式颜色）', () => {
    for (const [key, value] of Object.entries(COLORS)) {
      expect(typeof value, key).toBe('string');
      expect(value.trim().length, key + ' 不得为空').toBeGreaterThan(0);
      expect(COLOR_RE.test(value) || FUNCTIONAL_RE.test(value), `${key}=${value}`).toBe(true);
    }
  });

});
