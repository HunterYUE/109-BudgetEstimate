import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  serverHours,
  serverHourType,
  isoWeekOf,
  isValidDateStr,
  isLeaveCostCenter,
  isTrAdmin,
  trRoleOf,
  isManager,
  isValidUuidArray,
  isStatutoryHoliday,
} from '../src/routes/timerecording.js';

// 服务端权威计算（S4 修复）：hours/hour_type 一律由后端按起止时间与日期重算，不信任前端传入值。
// 这批纯函数决定所有工时记录的正确性（时长换算/加班判定/ISO 周归属/请休假判定/角色矩阵），
// 提取导出后直测，覆盖核心业务逻辑（后端门禁 tsc && vitest run 自动回归）。

describe('toMinutes 起止时间解析（"HH:MM"/"HH:MM:SS" → 当日分钟数）', () => {
  it('标准时刻', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('12:30')).toBe(750);
    expect(toMinutes('23:59')).toBe(1439);
  });
  it('非零填充小时也解析（\d{1,2}）', () => {
    expect(toMinutes('8:00')).toBe(480);
  });
  it('可选秒段忽略（≤59）', () => {
    expect(toMinutes('12:34:56')).toBe(754);
    expect(toMinutes('12:34:00')).toBe(754);
  });
  it('越界拒绝：小时 >23 / 分 >59 / 秒 >59', () => {
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('08:60')).toBeNull();
    expect(toMinutes('08:30:60')).toBeNull();
  });
  it('尾随垃圾/缺分/空输入 → null', () => {
    expect(toMinutes('12:34:56:78')).toBeNull();
    expect(toMinutes('08')).toBeNull();
    expect(toMinutes('')).toBeNull();
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes(undefined)).toBeNull();
  });
});

describe('serverHours 净工时（纯时长、无餐时扣减、15 分钟步进下为 0.25 倍数）', () => {
  it('标准时段', () => {
    expect(serverHours('08:00', '12:30')).toBe(4.5);
    expect(serverHours('18:00', '20:30')).toBe(2.5);
  });
  it('round2 浮点纪律（对齐 DB NUMERIC 2 位）', () => {
    expect(serverHours('08:00', '16:20')).toBe(8.33); // 8.3333… → 8.33
    expect(serverHours('00:00', '23:59')).toBe(23.98); // 23.9833… → 23.98
  });
  it('end <= start 或任一缺失 → 0（不跨午夜计负）', () => {
    expect(serverHours('12:30', '08:00')).toBe(0);
    expect(serverHours('08:00', '08:00')).toBe(0);
    expect(serverHours(null, '12:30')).toBe(0);
    expect(serverHours('08:00', undefined)).toBe(0);
  });
});

describe('serverHourType 加班判定（晚时段重叠 OR 周末 OR 法定节假日）', () => {
  it('工作日白天 → normal', () => {
    expect(serverHourType('2026-08-14', '09:00', '12:00')).toBe('normal'); // 周五
    expect(serverHourType('2026-08-14', '12:30', '13:00')).toBe('normal'); // 午间用餐间隙
  });
  it('周末 → overtime（周六/周日）', () => {
    expect(serverHourType('2026-08-15', '09:00', '12:00')).toBe('overtime'); // 周六
    expect(serverHourType('2026-08-16', '09:00', '12:00')).toBe('overtime'); // 周日
  });
  it('晚时段重叠 → overtime（含跨 18:00 边界与 20:30 之后）', () => {
    expect(serverHourType('2026-08-14', '18:00', '20:30')).toBe('overtime');
    expect(serverHourType('2026-08-14', '17:00', '18:30')).toBe('overtime'); // 重叠 18:00
    expect(serverHourType('2026-08-14', '20:00', '21:00')).toBe('overtime'); // 跨 20:30 下界仍判加班
  });
  it('法定节假日 → overtime（2026-10-01 国庆）', () => {
    expect(serverHourType('2026-10-01', '09:00', '12:00')).toBe('overtime');
  });
  it('无日期 → 仅晚时段判定（wd=-1 不触发周末/节假日）', () => {
    expect(serverHourType(null, '09:00', '12:00')).toBe('normal');
  });
});

describe('isStatutoryHoliday 法定节假日（与前端 src/utils/holidays.js 同步）', () => {
  it('2026-10-01（国庆）为假', () => {
    expect(isStatutoryHoliday(new Date(2026, 9, 1))).toBe(true);
  });
  it('平日与无列表年份非假', () => {
    expect(isStatutoryHoliday(new Date(2026, 7, 14))).toBe(false); // 2026-08-14
    expect(isStatutoryHoliday(new Date(2027, 0, 1))).toBe(false); // 2027 无配置
  });
});

describe('isoWeekOf ISO 周计算（周一起，与 PG EXTRACT(WEEK/ISOYEAR) 及前端 dayjs isoWeek 一致）', () => {
  it('常规日期', () => {
    expect(isoWeekOf('2026-08-14')).toEqual({ year: 2026, week: 33 }); // 周五
  });
  it('跨年边界：12 月底归次年 W1（2025-12-29 周一）', () => {
    expect(isoWeekOf('2025-12-29')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2025-12-28')).toEqual({ year: 2025, week: 52 }); // 周日
  });
  it('次年 1 月初归上年 W53（2027-01-01 周五在 2026 W53）', () => {
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2026-12-28')).toEqual({ year: 2026, week: 53 }); // 周一
  });
  it('年初周四在 W1（2026-01-01）', () => {
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2026-01-04')).toEqual({ year: 2026, week: 1 }); // 周日仍属上一 ISO 周
  });
});

describe('isValidDateStr 真实历法日期（格式 + 回验，拦 2026-02-30 越界）', () => {
  it('合法日期', () => {
    expect(isValidDateStr('2026-08-14')).toBe(true);
    expect(isValidDateStr('2024-02-29')).toBe(true); // 闰年
  });
  it('越界/回绕拒绝', () => {
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(isValidDateStr('2025-02-29')).toBe(false); // 非闰年
    expect(isValidDateStr('2026-04-31')).toBe(false); // 4 月仅 30 天
    expect(isValidDateStr('2026-13-01')).toBe(false);
  });
  it('格式与类型拒绝', () => {
    expect(isValidDateStr('2026-8-5')).toBe(false); // 非零填充
    expect(isValidDateStr('abc')).toBe(false);
    expect(isValidDateStr(null)).toBe(false);
    expect(isValidDateStr(20260814)).toBe(false);
  });
});

describe('isLeaveCostCenter 请休假成本中心判定（编码 A####-LE-### 或类型标记 leave）', () => {
  it('LE 编码命中（防客户端把 LE 码标成其他类型）', () => {
    expect(isLeaveCostCenter('A2026-LE-001')).toBe(true);
  });
  it('type=leave 命中（防把非 LE 码伪报请休假）', () => {
    expect(isLeaveCostCenter('A2026-PJ-001', 'leave')).toBe(true);
  });
  it('其他/空 → false', () => {
    expect(isLeaveCostCenter('A2026-PJ-001')).toBe(false);
    expect(isLeaveCostCenter('A2026-DE-001', 'project')).toBe(false);
    expect(isLeaveCostCenter(null)).toBe(false);
    expect(isLeaveCostCenter('')).toBe(false);
  });
});

describe('isTrAdmin / trRoleOf / isManager 工时角色矩阵（admin 视 director 全权）', () => {
  it('isTrAdmin：director/admin 为管理员，其余否', () => {
    expect(isTrAdmin({ role: 'director' })).toBe(true);
    expect(isTrAdmin({ role: 'admin' })).toBe(true);
    expect(isTrAdmin({ role: 'manager' })).toBe(false);
    expect(isTrAdmin({ role: 'user' })).toBe(false);
    expect(isTrAdmin(undefined)).toBe(false);
  });
  it('trRoleOf：admin 按 director 级；方案·交付经理按权限命中 manager', () => {
    expect(trRoleOf({ role: 'director' })).toBe('director');
    expect(trRoleOf({ role: 'admin' })).toBe('director');
    expect(trRoleOf({ role: 'user', permissions: ['报价编制'] })).toBe('manager');
    expect(trRoleOf({ role: 'user', permissions: ['交付管理'] })).toBe('manager');
    expect(trRoleOf({ role: 'user', permissions: [] })).toBe('employee');
    expect(trRoleOf(undefined)).toBe('employee');
  });
  it('isManager：总监 + 方案·交付经理可分配任务/查看全员，员工否', () => {
    expect(isManager({ role: 'admin' })).toBe(true);
    expect(isManager({ role: 'user', permissions: ['报价编制'] })).toBe(true);
    expect(isManager({ role: 'user', permissions: [] })).toBe(false);
  });
});

describe('isValidUuidArray uuid 数组校验（submit-batch/review-batch 入参，防 22P02 整批 400）', () => {
  it('合法数组 → true', () => {
    const u = '123e4567-e89b-12d3-a456-426614174000';
    expect(isValidUuidArray([u, '123e4567-e89b-12d3-a456-426614174001'])).toBe(true);
  });
  it('空/非法/非数组 → false', () => {
    expect(isValidUuidArray([])).toBe(false);
    expect(isValidUuidArray(['not-a-uuid'])).toBe(false);
    expect(isValidUuidArray([123])).toBe(false);
    expect(isValidUuidArray('abc')).toBe(false);
    expect(isValidUuidArray(null)).toBe(false);
  });
});
