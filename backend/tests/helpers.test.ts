import { describe, it, expect } from 'vitest';
import {
  assertCanManage,
  ROLE_RANK,
  normalizeEmail,
  objKeysToSnake,
  parsePagination,
  round2,
  buildSearchWhere,
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
