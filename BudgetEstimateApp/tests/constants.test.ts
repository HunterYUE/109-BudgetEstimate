import { describe, it, expect } from 'vitest';
import {
  STAGE_COLORS, NODE_NAMES, NODE_DISPLAY_NAMES,
  DEFAULT_DESIGN_HOURLY_RATE, DEFAULT_ASSEMBLY_HOURLY_RATE, TAX_RATE, LIST_LIMIT,
} from '../src/utils/constants';

describe('默认业务常量（B22 魔法数字收敛单源）', () => {
  it('税率 13%、设计/装配工时费率、拉取上限', () => {
    expect(TAX_RATE).toBe(0.13);
    expect(DEFAULT_DESIGN_HOURLY_RATE).toBe(175);
    expect(DEFAULT_ASSEMBLY_HOURLY_RATE).toBe(85);
    expect(LIST_LIMIT).toBe('100000'); // 对齐后端 parsePagination 上限，防聚合静默截断
  });
});

describe('交付标准 15 节点', () => {
  it('NODE_NAMES 与 NODE_DISPLAY_NAMES 一一对应（各 15）', () => {
    expect(NODE_NAMES).toHaveLength(15);
    expect(NODE_DISPLAY_NAMES).toHaveLength(15);
    expect(NODE_NAMES[0]).toBe('Handover');
    expect(NODE_NAMES[14]).toBe('项目总结');
    expect(NODE_DISPLAY_NAMES[0]).toBe('资料\n交接');
    expect(NODE_DISPLAY_NAMES[14]).toBe('项目\n总结');
  });
});

describe('机会阶段颜色（B14 收敛）', () => {
  it('6 阶段 key 齐全且值为颜色串', () => {
    expect(Object.keys(STAGE_COLORS)).toEqual(['信息', '线索', '机会', '投标', '议价', '中标']);
    for (const c of Object.values(STAGE_COLORS)) {
      expect(typeof c).toBe('string');
    }
  });
});
