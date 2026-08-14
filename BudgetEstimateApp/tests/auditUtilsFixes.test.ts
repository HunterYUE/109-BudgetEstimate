import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Group } from '../src/types';
import { sanitizeExportFilename } from '../src/utils/exportToExcel';
import { buildCostLines } from '../src/utils/costBreakdown';

// ── 审计工具层修复回归测试（2026-08-14 全量审计 Budget）──
// 覆盖：U2 costBreakdown undefined 单价/数量兜底、U4 蓝表空角色禁存、U5 PART 类型标签、
//       U7 导出文件名清洗（保留名/尾随点）、U8 付款条件缺期回退 0。
// 纯函数直测（U2/U7）+ 静态源码断言（U4/U5/U8，组件内 hooks 不可直接实例化）。

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('U7：sanitizeExportFilename 导出文件名清洗（Windows 非法字符 + 保留名 + 尾随点/空格）', () => {
  it('非法字符 \\ / : * ? " < > | 全部替换为 _', () => {
    expect(sanitizeExportFilename('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
  });
  it('尾随点/空格裁剪（Windows 忽略扩展名前的尾随点，会静默改名）', () => {
    expect(sanitizeExportFilename('项目报价表. ')).toBe('项目报价表');
    expect(sanitizeExportFilename('报价单...')).toBe('报价单');
  });
  it('Windows 保留设备名加前缀防被当设备（大小写不敏感）', () => {
    expect(sanitizeExportFilename('CON')).toBe('_CON');
    expect(sanitizeExportFilename('COM1')).toBe('_COM1');
    expect(sanitizeExportFilename('lpt3')).toBe('_lpt3');
    expect(sanitizeExportFilename('nul')).toBe('_nul');
  });
  it('空串兜底 export（调用方传空名时不产出空文件名）', () => {
    expect(sanitizeExportFilename('')).toBe('export');
  });
  it('正常文件名原样保留', () => {
    expect(sanitizeExportFilename('2026-08-报价单_终版')).toBe('2026-08-报价单_终版');
  });
});

describe('U2：buildCostLines 单价/数量 undefined 兜底（与 calcDirectCost 同口径，防 NaN）', () => {
  const fixture = (): Group[] => [{
    id: 'g1', name: '设备组1', groupType: 'EQUIPMENT', sortOrder: 0,
    items: [{ id: 'x1', code: 'EQ-001', description: '未填价量', qtyTotal: undefined, unitCost: undefined }],
  }] as unknown as Group[]; // fixture 有意缺省必填字段（qtyTotal/unitCost），经 unknown 桥接避免 any

  it('unitCost/qtyTotal 缺失 → estimated=0、qty=1（不产出 NaN）', () => {
    const [line] = buildCostLines(fixture(), {});
    expect(line.estimated).toBe(0);
    expect(line.qty).toBe(1);
    expect(Number.isNaN(line.estimated)).toBe(false);
    expect(Number.isNaN(line.qty)).toBe(false);
  });

  it('qtyTotal 缺失但单价存在 → estimated=单价×1', () => {
    const fx = fixture();
    fx[0].items[0].unitCost = 120;
    const [line] = buildCostLines(fx, {});
    expect(line.estimated).toBe(120);
  });
});

describe('U4：蓝表保存校验——角色全删空（roles.length===0）禁止保存', () => {
  const bm = src('components/BlueTableModal.tsx');
  it('validateBeforeSave 含 roles.length===0 拦截', () => {
    expect(bm).toContain('bt.roles.length === 0');
    expect(bm).toContain('请至少添加一个采购角色');
  });
});

describe('U5：物料类型标签补 PART 缩写（与 CS/CP/SW/SV 一致）', () => {
  const itf = src('components/ItemTable.tsx');
  it('LABELS 含 PART: PA', () => {
    expect(itf).toContain("PART: 'PA'");
  });
});

describe('U8：付款条件 formatPayment 缺期回退 0（防 undefined% 污染）', () => {
  const ph = src('components/ProjectHeader.tsx');
  it('vals[i] 用 ?? 0 兜底，不再拼接 undefined%', () => {
    expect(ph).toContain('(vals[i] ?? 0)');
    expect(ph).not.toContain("vals[i] + '%'");
  });
});
