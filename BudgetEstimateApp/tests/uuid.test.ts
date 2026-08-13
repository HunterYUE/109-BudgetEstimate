import { describe, it, expect } from 'vitest';
import { uuid } from '../src/utils/uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid v4 格式（优先 crypto.randomUUID，降级伪随机同样合规）', () => {
  it('符合 RFC4122 v4 格式（版本位 4、变体位 8/9/a/b）', () => {
    expect(uuid()).toMatch(V4);
  });
  it('连续调用不重复', () => {
    expect(uuid()).not.toBe(uuid());
  });
});
