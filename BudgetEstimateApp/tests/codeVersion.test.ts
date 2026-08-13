import { describe, it, expect } from 'vitest';
import { parseVersionFromCode } from '../src/utils/codeVersion';

describe('parseVersionFromCode 编码版本号解析', () => {
  it('正式版 -V1.0 / -V2.3 → isTemp false', () => {
    expect(parseVersionFromCode('SV-DESIGN-000000-V1.0')).toEqual({ version: 'V1.0', isTemp: false });
    expect(parseVersionFromCode('ABC-123-V2.3')).toEqual({ version: 'V2.3', isTemp: false });
  });
  it('临时版 V0.x → isTemp true（未发布正式版）', () => {
    expect(parseVersionFromCode('ABC-123-V0.5')).toEqual({ version: 'V0.5', isTemp: true });
    expect(parseVersionFromCode('ABC-123-V0.99')).toEqual({ version: 'V0.99', isTemp: true });
  });
  it('无版本后缀 / 非 Vx.y 结尾 → null', () => {
    expect(parseVersionFromCode('ABC-123')).toBeNull();
    expect(parseVersionFromCode('ABC-123-V1')).toBeNull();      // 无小数点
    expect(parseVersionFromCode('ABC-123-V2.0.1')).toBeNull();  // 多小数点
    expect(parseVersionFromCode('ABC-V1.0-suffix')).toBeNull(); // 要求 $ 结尾
    expect(parseVersionFromCode('')).toBeNull();
    expect(parseVersionFromCode(null)).toBeNull();
    expect(parseVersionFromCode(undefined)).toBeNull();
  });
});
