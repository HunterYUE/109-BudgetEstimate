import { describe, it, expect } from 'vitest';
import {
  assertCanManage,
  ROLE_RANK,
  normalizeEmail,
  objKeysToSnake,
  parsePagination,
  round2,
  buildSearchWhere,
  camelToSnake,
  escapeLikePattern,
  serializeParams,
  EMAIL_RE,
} from '../src/routes/helpers.js';

describe('ROLE_RANK 角色等级（F02 越级保护基线）', () => {
  it('user < manager < director < admin', () => {
    expect(ROLE_RANK).toEqual({ user: 0, manager: 1, director: 2, admin: 3 });
  });
});

describe('assertCanManage 越级保护（A6 回归：director 不能再管理 admin）', () => {
  it('高等级操作者可管理任意低等级', () => {
    expect(() => assertCanManage('admin', ROLE_RANK.admin)).not.toThrow();
    expect(() => assertCanManage('admin', ROLE_RANK.director)).not.toThrow();
    expect(() => assertCanManage('admin', ROLE_RANK.manager)).not.toThrow();
    expect(() => assertCanManage('admin', ROLE_RANK.user)).not.toThrow();
    expect(() => assertCanManage('director', ROLE_RANK.manager)).not.toThrow();
    expect(() => assertCanManage('manager', ROLE_RANK.user)).not.toThrow();
  });
  it('同级可管理；低等级操作高等级抛 403', () => {
    expect(() => assertCanManage('director', ROLE_RANK.director)).not.toThrow();
    expect(() => assertCanManage('user', ROLE_RANK.user)).not.toThrow();
    expect(() => assertCanManage('director', ROLE_RANK.admin)).toThrow(/无权/);
    expect(() => assertCanManage('manager', ROLE_RANK.director)).toThrow(/无权/);
    expect(() => assertCanManage('user', ROLE_RANK.manager)).toThrow(/无权/);
  });
  it('未知操作者角色按最低等级 0，无法管理任何已登记角色（防未登记角色绕过）', () => {
    expect(() => assertCanManage('superadmin', ROLE_RANK.admin)).toThrow(/无权/);
    expect(() => assertCanManage('', ROLE_RANK.manager)).toThrow(/无权/);
    expect(() => assertCanManage('unknown', ROLE_RANK.manager)).toThrow(/无权/);
  });
});

describe('normalizeEmail 邮箱归一化（F07 认证与账号链路统一口径）', () => {
  it('trim + 小写，防近似重复账号与大小写漂移', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
    expect(normalizeEmail('USER@X.COM')).toBe('user@x.com');
    expect(normalizeEmail('  plain@test.cn ')).toBe('plain@test.cn');
    expect(normalizeEmail(' a@b.c ')).toBe('a@b.c');
  });
});

describe('objKeysToSnake 键名转换（F10 前后端契约：camelCase → snake_case）', () => {
  it('多驼峰键全部转蛇形', () => {
    expect(objKeysToSnake({ userId: 1, planStatus: 'draft', salesNo: 'Q-001' }))
      .toEqual({ user_id: 1, plan_status: 'draft', sales_no: 'Q-001' });
  });
  it('已是蛇形/无大写键原样保留', () => {
    expect(objKeysToSnake({ id: 1, created_at: 'x' })).toEqual({ id: 1, created_at: 'x' });
  });
  it('空对象', () => {
    expect(objKeysToSnake({})).toEqual({});
  });
});

describe('round2 数值精度纪律（F04：聚合后去浮点噪声）', () => {
  it('消除 float64 累加噪声', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(4.1 + 3.9)).toBe(8);
    expect(round2(8.000000000000002)).toBe(8);
  });
  it('保留 2 位小数、第三位四舍五入', () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.3)).toBe(12.3);
  });
});

describe('parsePagination 分页参数钳制（F01 输入边界）', () => {
  it('未传参数回退默认（DEFAULT_PAGE_SIZE=100）', () => {
    expect(parsePagination({})).toEqual({ limit: 100, offset: 0 });
  });
  it('合法参数透传', () => {
    expect(parsePagination({ limit: '50', offset: '10' })).toEqual({ limit: 50, offset: 10 });
  });
  it('limit 超上限钳到 PAGE_LIMIT，负 offset 归 0', () => {
    expect(parsePagination({ limit: '999999999', offset: '-5' })).toEqual({ limit: 100000, offset: 0 });
  });
  it('非法 limit 与 0 均按未传回退默认（防 LIMIT 0 返回空集）', () => {
    expect(parsePagination({ limit: 'abc' })).toEqual({ limit: 100, offset: 0 });
    expect(parsePagination({ limit: '0' })).toEqual({ limit: 100, offset: 0 });
  });
  it('负数 limit 钳到最小 1（Math.max 下界生效）', () => {
    expect(parsePagination({ limit: '-5' })).toEqual({ limit: 1, offset: 0 });
  });
  it('自定义 defaultLimit（工时列表全量读取口径）', () => {
    expect(parsePagination({}, 1000)).toEqual({ limit: 1000, offset: 0 });
  });
});

describe('buildSearchWhere ILIKE 搜索子句（F01 通配符转义 + F10 参数索引契约）', () => {
  it('空/缺省 search 返回空串且不污染 params', () => {
    const params: unknown[] = [];
    expect(buildSearchWhere('', ['name'], params)).toBe('');
    expect(buildSearchWhere(null, ['name'], params)).toBe('');
    expect(buildSearchWhere(undefined, ['name'], params)).toBe('');
    expect(params).toEqual([]);
  });
  it('% / _ / 反斜杠 通配符转义（防用户输入当通配符）', () => {
    const params: unknown[] = [];
    const sql = buildSearchWhere('50%_off\\x', ['name'], params);
    expect(sql).toContain('ILIKE');
    expect(params).toEqual(['%50\\%\\_off\\\\x%']);
  });
  it('多字段逐字段递增参数索引 $1/$2/$3，参数数与引用数一致（回归：共用 $1 产生死参数）', () => {
    const params: unknown[] = [];
    const sql = buildSearchWhere('abc', ['sales_no', 'client_name', 'project_name'], params, 'dp');
    expect(sql).toBe(
      ' WHERE dp."sales_no"::text ILIKE $1 OR dp."client_name"::text ILIKE $2 OR dp."project_name"::text ILIKE $3'
    );
    expect(params).toEqual(['%abc%', '%abc%', '%abc%']);
  });
  it('单字段无别名（crudRoutes 标签/物料列表路径）', () => {
    const params: unknown[] = [];
    const sql = buildSearchWhere('x', ['name'], params);
    expect(sql).toBe(' WHERE "name"::text ILIKE $1');
    expect(params).toEqual(['%x%']);
  });
});

describe('camelToSnake 单键驼峰→蛇形（objKeysToSnake 原子；导出供单测直测）', () => {
  it('单驼峰键', () => {
    expect(camelToSnake('userId')).toBe('user_id');
    expect(camelToSnake('salesNo')).toBe('sales_no');
    expect(camelToSnake('planStatus')).toBe('plan_status');
  });
  it('已是蛇形/纯小写原样返回（无大写字母即不命中替换）', () => {
    expect(camelToSnake('created_at')).toBe('created_at');
    expect(camelToSnake('plain')).toBe('plain');
    expect(camelToSnake('')).toBe('');
  });
});

describe('escapeLikePattern 通配符转义（auditLogs 搜索与 buildSearchWhere 共用，A10 统一口径）', () => {
  it('% / _ / 反斜杠 前缀转义', () => {
    expect(escapeLikePattern('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });
  it('无通配符（含中文）原样返回', () => {
    expect(escapeLikePattern('测试 项目')).toBe('测试 项目');
    expect(escapeLikePattern('')).toBe('');
    expect(escapeLikePattern('plain')).toBe('plain');
  });
});

describe('serializeParams JSONB/TEXT[] 参数序列化（F9：空数组按列类型区分）', () => {
  const cols = ['id', 'tags', 'json_col'];
  const textArraySet = new Set(['tags']);
  it('对象数组 JSON.stringify（JSONB 列）', () => {
    expect(serializeParams(['x', [{ a: 1 }], [{ b: 2 }]], cols, textArraySet))
      .toEqual(['x', '[{"a":1}]', '[{"b":2}]']);
  });
  it('空数组：TEXT[] 列 "{}"、JSONB 列 "[]"', () => {
    expect(serializeParams(['x', [], []], cols, textArraySet)).toEqual(['x', '{}', '[]']);
  });
  it('数字/布尔数组 stringify；字符串数组原样保留（TEXT[] 直接给 pg）', () => {
    expect(serializeParams([['s1', 's2']], cols, textArraySet)).toEqual([['s1', 's2']]);
    expect(serializeParams([[1, 2]], cols, textArraySet)).toEqual(['[1,2]']);
    expect(serializeParams([[true]], cols, textArraySet)).toEqual(['[true]']);
  });
  it('null/undefined 透传', () => {
    expect(serializeParams([null, undefined], cols, textArraySet)).toEqual([null, undefined]);
  });
  it('未传 textArraySet 时空数组一律 "[]"（JSONB 默认）', () => {
    expect(serializeParams([[]], cols)).toEqual(['[]']);
  });
  it('不传 cols 时仅按值类型处理（无列类型上下文）', () => {
    expect(serializeParams([[], 'x'])).toEqual(['[]', 'x']);
  });
});

describe('EMAIL_RE 邮箱格式白名单（auth 登录与 users 创建/更新共用，防双份漂移）', () => {
  it('合法邮箱通过', () => {
    expect(EMAIL_RE.test('a@b.com')).toBe(true);
    expect(EMAIL_RE.test('user.name+tag@example.co.uk')).toBe(true);
    expect(EMAIL_RE.test('cn@test.cn')).toBe(true);
  });
  it('非法邮箱拒绝', () => {
    expect(EMAIL_RE.test('no-at-sign')).toBe(false);
    expect(EMAIL_RE.test('a@b')).toBe(false); // 缺 TLD 点
    expect(EMAIL_RE.test('@b.com')).toBe(false);
    expect(EMAIL_RE.test('a b@c.com')).toBe(false); // 含空格
    expect(EMAIL_RE.test('a@b@c.com')).toBe(false);
  });
});
