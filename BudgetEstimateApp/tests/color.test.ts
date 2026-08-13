import { describe, it, expect } from 'vitest';
import { withAlpha } from '../src/utils/color';

describe('withAlpha 十六进制 → rgba', () => {
  it('6 位 hex 解析', () => {
    expect(withAlpha('#1677ff', 0.1)).toBe('rgba(22, 119, 255, 0.1)');
    expect(withAlpha('#00509e', 1)).toBe('rgba(0, 80, 158, 1)');
  });
  it('3 位简写展开', () => {
    expect(withAlpha('#888', 0.5)).toBe('rgba(136, 136, 136, 0.5)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });
  it('非法输入 → 中性灰 rgba', () => {
    expect(withAlpha('', 0.2)).toBe('rgba(128,128,128,0.2)');
    expect(withAlpha('red', 0.2)).toBe('rgba(128,128,128,0.2)');
    expect(withAlpha('#ggg', 0.2)).toBe('rgba(128,128,128,0.2)');
  });
});

describe('withAlpha 补充', () => {
  it('无 # 前缀裸 hex 解析；alpha=0 透传', () => {
    expect(withAlpha('1677ff', 0)).toBe('rgba(22, 119, 255, 0)');
    expect(withAlpha('1677ff', 0.5)).toBe('rgba(22, 119, 255, 0.5)');
  });
});
