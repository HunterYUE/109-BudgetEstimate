import { describe, it, expect } from 'vitest';
import { toCamel, toSnake } from '../src/utils/api';

// F10 前后端契约一致性：camelCase↔snake_case 转换层（api.ts 唯一 fetch 层）
// 记忆命名规范：GET 响应 toCamel、POST/PUT body toSnake；所有 API 通信必须走此层。

describe('toCamel 响应转换（后端 snake_case → 前端 camelCase）', () => {
  it('扁平键：contract_amount → contractAmount', () => {
    expect(toCamel({ contract_amount: 1130, tax_rate: 0.13 })).toEqual({ contractAmount: 1130, taxRate: 0.13 });
  });
  it('嵌套对象递归转换', () => {
    expect(toCamel({ project: { version_no: 1, baseline_planned_end_date: '2026-06-30' } }))
      .toEqual({ project: { versionNo: 1, baselinePlannedEndDate: '2026-06-30' } });
  });
  it('数组元素递归转换', () => {
    expect(toCamel({ nodes: [{ node_no: 1, actual_date: '2026-05-20' }] }))
      .toEqual({ nodes: [{ nodeNo: 1, actualDate: '2026-05-20' }] });
  });
  it('下划线前缀键保留（_risk/_commercial 内部标识符不转换）', () => {
    expect(toCamel({ _risk: 134, _commercial: { total_cost: 100 } }))
      .toEqual({ _risk: 134, _commercial: { totalCost: 100 } });
  });
  it('Date 实例原样保留（不递归进 Date 内部键）', () => {
    const d = new Date('2026-05-20T00:00:00Z');
    expect(toCamel({ created_at: d })).toEqual({ createdAt: d });
  });
  it('null / undefined / 原始值 / 数组顶层透传', () => {
    expect(toCamel(null)).toBeNull();
    expect(toCamel(undefined)).toBeUndefined();
    expect(toCamel('str')).toBe('str');
    expect(toCamel(42)).toBe(42);
    expect(toCamel([{ a_b: 1 }])).toEqual([{ aB: 1 }]);
  });
  it('连续下划线 / 无下划线键不受影响', () => {
    expect(toCamel({ id: 1, sales_no: 'S1', abc_def_gh: 2 })).toEqual({ id: 1, salesNo: 'S1', abcDefGh: 2 });
  });
});

describe('toSnake 请求转换（前端 camelCase → 后端 snake_case）', () => {
  it('扁平键：contractAmount → contract_amount', () => {
    expect(toSnake({ contractAmount: 1130, taxRate: 0.13 })).toEqual({ contract_amount: 1130, tax_rate: 0.13 });
  });
  it('嵌套对象递归转换', () => {
    expect(toSnake({ project: { versionNo: 1, baselinePlannedEndDate: '2026-06-30' } }))
      .toEqual({ project: { version_no: 1, baseline_planned_end_date: '2026-06-30' } });
  });
  it('数组元素递归转换', () => {
    expect(toSnake({ nodes: [{ nodeNo: 1, actualDate: '2026-05-20' }] }))
      .toEqual({ nodes: [{ node_no: 1, actual_date: '2026-05-20' }] });
  });
  it('Date 实例原样保留', () => {
    const d = new Date('2026-05-20T00:00:00Z');
    expect(toSnake({ createdAt: d })).toEqual({ created_at: d });
  });
  it('null / undefined / 原始值透传', () => {
    expect(toSnake(null)).toBeNull();
    expect(toSnake(undefined)).toBeUndefined();
    expect(toSnake('str')).toBe('str');
    expect(toSnake([{ aB: 1 }])).toEqual([{ a_b: 1 }]);
  });
  it('已是蛇形键不受影响（幂等）', () => {
    expect(toSnake({ already_snake: 1 })).toEqual({ already_snake: 1 });
  });
});
