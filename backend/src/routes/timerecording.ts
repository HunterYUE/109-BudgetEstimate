import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, getClient } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { signToken } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit } from './helpers.js';
import { ensureCostCenters, recentFiscalYears, availableCostCenterFys, fiscalYearLabel } from '../jobs/costCenterSync.js';

const router = Router();

/** 是否为工时系统管理员（director/admin，JWT role） */
const isTrAdmin = (u: { role?: string } | undefined): boolean => !!u && (u.role === 'director' || u.role === 'admin');

/**
 * 成本中心存在性校验（共享基底，任务与工时记录复用）：
 *   -S(sales)/-E(project) 实时查预算库；-W(warranty)/-DE-(department)/-00-(personal) 查工时码表。
 *   部门/个人中心还须处于可用财年窗口（新财年提前一月生成、老财年延续新财年首月），
 *   防止把早已归档或远未生成的部门/个人中心派给任务。
 *   opts.allowDE: 工时记录允许部门中心；任务则只允许个人中心（部门中心不用于任务）。
 */
async function assertCostCenterValidBase(
  code: string | null | undefined,
  label: string,
  opts: { allowDE: boolean }
): Promise<void> {
  // ⚠️ 分配任务时成本中心必填，不能为空
  if (!code) throw new AppError(400, '成本中心不能为空');
  const m = /^A(\d{4})-(DE|00|LE)-\d{3}$/.exec(code);
  if (m) {
    // ⚠️ 任务不允许部门中心，也不允许请休假中心（请休假只用于工时记录，不用于任务）
    if (!opts.allowDE && (m[2] === 'DE' || m[2] === 'LE')) throw new AppError(400, `${label}不能使用部门或请休假成本中心，请选择项目或个人成本中心`);
    const fy = 'FY' + m[1];
    const row = await query('SELECT 1 FROM timerecording.cost_centers WHERE code = $1', [code]);
    if (!row.rows.length) throw new AppError(400, `${label}「${code}」不存在`);
    if (!availableCostCenterFys().includes(fy)) {
      throw new AppError(400, `${label}「${code}」当前不可用（成本中心仅新财年提前一月生成、老财年延续至新财年首月）`);
    }
    return;
  }
  if (code.endsWith('-W')) {
    const row = await query(`SELECT 1 FROM timerecording.cost_centers WHERE code = $1 AND type = 'warranty'`, [code]);
    if (!row.rows.length) throw new AppError(400, `${label}「${code}」不存在`);
    return;
  }
  if (code.endsWith('-S')) {
    const row = await query('SELECT 1 FROM sales_opportunities WHERE sales_no = $1', [code]);
    if (!row.rows.length) throw new AppError(400, `${label}「${code}」不存在`);
    return;
  }
  if (code.endsWith('-E')) {
    const row = await query('SELECT 1 FROM delivery_projects WHERE sales_no = $1', [code]);
    if (!row.rows.length) throw new AppError(400, `${label}「${code}」不存在`);
    return;
  }
  throw new AppError(400, `${label}「${code}」格式无效`);
}

/** 任务成本中心（部门中心不允许） */
function assertCostCenterValid(code: string | null | undefined, label = '成本中心'): Promise<void> {
  return assertCostCenterValidBase(code, label, { allowDE: false });
}

/** 工时记录成本中心（允许部门中心；空值放行以兼容历史行为） */
function assertTimeCostCenterValid(code: string | null | undefined, label = '成本中心'): Promise<void> {
  if (!code) return Promise.resolve();
  return assertCostCenterValidBase(code, label, { allowDE: true });
}

/** 工时记录成本中心类型枚举（服务端权威，POST/PUT 校验共用；防前端伪造类型） */
const TIME_COST_CENTER_TYPES = ['sales', 'project', 'warranty', 'department', 'personal', 'leave'] as const;

/** 通知类型枚举（对齐 DB CHECK notifications_type_check，POST /notifications 校验共用） */
const NOTIFICATION_TYPES = ['approval', 'rejection', 'submission', 'task', 'task_feedback', 'reminder', 'withdraw'] as const;

/** 请休假成本中心编码 A####-LE-###（isLeaveCostCenter 与回填/查询共用） */
const LE_CODE_RE = /^A\d{4}-LE-\d{3}$/;

/** 是否请休假成本中心（编码 A####-LE-### 或类型标记 leave）：请休假硬性规则共用判断，
 *  防客户端把 LE 码标成其他类型（type 与 code 任一命中即按请休假校验） */
function isLeaveCostCenter(code: string | null | undefined, type?: string | null): boolean {
  return type === 'leave' || LE_CODE_RE.test(code || '');
}

/** 请休假硬性校验（POST/PUT 共用）：
 *   - 晚班/周末/节假日（hour_type 服务端派生 overtime）拒绝；
 *   - 单日请休假合计 ≤ 8 小时（含本行工时；PUT 传 excludeId 排除本条自身）。
 *   code/type 任一命中请休假（isLeaveCostCenter 口径）即触发校验 */
async function assertLeaveValid(opts: {
  userId: string;
  date: string;
  hours: number;
  hourType: 'normal' | 'overtime';
  code: string | null | undefined;
  type?: string | null;
  excludeId?: string;
}): Promise<void> {
  if (!isLeaveCostCenter(opts.code, opts.type)) return;
  if (opts.hourType === 'overtime') throw new AppError(400, '请休假不能用于晚班/周末/节假日时段');
  const params = opts.excludeId ? [opts.userId, opts.date, opts.excludeId] : [opts.userId, opts.date];
  const dayTotal = (await query(
    `SELECT COALESCE(SUM(hours), 0) AS total FROM timerecording.time_records
     WHERE user_id = $1 AND date = $2${opts.excludeId ? ' AND id <> $3' : ''} AND (cost_center_type = 'leave' OR cost_center LIKE 'A%-LE-%')`,
    params
  )).rows[0].total;
  if (Number(dayTotal) + opts.hours > 8) throw new AppError(400, '请休假每天最多 8 小时');
}

/** 由日期计算 ISO 周号与 ISO 年（周一起，与 PG EXTRACT(WEEK/ISOYEAR) 及前端 dayjs isoWeek 一致） */
function isoWeekOf(dateStr: string): { year: number; week: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7; // 周日=7（ISO 周一始）
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

/** uuid 数组校验（submit-batch/review-batch 入参，防 22P02 整批 400） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuidArray(ids: any): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.every(v => typeof v === 'string' && UUID_RE.test(v));
}

/**
 * 工时角色（派生自预算用户 role + permissions）：
 *   director 总监（全部权限） / manager 方案·交付经理（可分配任务、查看综合分析） / employee 员工（仅本人填报/统计）
 */
const trRoleOf = (u: { role?: string; permissions?: string[] } | undefined): 'director' | 'manager' | 'employee' => {
  if (u?.role === 'director') return 'director';
  const perms: string[] = u?.permissions || [];
  if (perms.includes('报价编制') || perms.includes('交付管理')) return 'manager';
  return 'employee';
};
/** 是否能分配任务 / 查看全员数据（总监 + 方案·交付经理） */
const isManager = (u: { role?: string; permissions?: string[] } | undefined): boolean => trRoleOf(u) !== 'employee';

// ─── 服务端权威计算（S4 修复）─────────────────────────────
// hours/hour_type 一律由后端按起止时间与日期重算，不信任前端传入值（防伪造、防前后端口径漂移）。

/** "HH:MM"（或含秒 "HH:MM:SS"）→ 分钟数；格式非法返回 null */
function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  // 锚定结尾并允许可选秒段：尾随垃圾（"12:34:56:78"）、越界秒（"12:34:99"）均拒绝
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10), sec = m[3] !== undefined ? parseInt(m[3], 10) : 0;
  if (h > 23 || mi > 59 || sec > 59) return null;
  return h * 60 + mi;
}

/** 净工时：由起止时间换算（纯时长，无餐时扣减；15 分钟步进下为 0.25 的倍数） */
function serverHours(start?: string | null, end?: string | null): number {
  const s = toMinutes(start), e = toMinutes(end);
  if (s == null || e == null || e <= s) return 0;
  return Math.round(((e - s) / 60) * 100) / 100;
}

/** 法定节假日（仅放假当天，与前端 src/utils/holidays.js 保持同步；补班日不在此列） */
const STATUTORY_HOLIDAYS: Record<number, string[]> = {
  2025: ['01-01','01-28','01-29','01-30','01-31','02-01','02-02','02-03','02-04','04-04','04-05','04-06','05-01','05-02','05-03','05-04','05-05','05-31','06-01','06-02','10-01','10-02','10-03','10-04','10-05','10-06','10-07','10-08'],
  2026: ['01-01','01-02','01-03','02-15','02-16','02-17','02-18','02-19','02-20','02-21','02-22','02-23','04-04','04-05','04-06','05-01','05-02','05-03','05-04','05-05','06-19','06-20','06-21','09-25','09-26','09-27','10-01','10-02','10-03','10-04','10-05','10-06','10-07'],
};
function isStatutoryHoliday(d: Date): boolean {
  const list = STATUTORY_HOLIDAYS[d.getFullYear()];
  if (!list) return false;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return list.includes(`${mm}-${dd}`);
}

/** 加班判定：晚时段(18:00-20:30)重叠 OR 周末 OR 法定节假日（与前端 isOvertime 一致） */
function serverHourType(date?: string | null, start?: string | null, end?: string | null): 'normal' | 'overtime' {
  const s = toMinutes(start), e = toMinutes(end);
  const evening = s != null && e != null && Math.max(0, Math.min(e, 1230) - Math.max(s, 1080)) > 0;
  const [y, m, d] = String(date || '').split('-').map(Number);
  const wd = (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) ? new Date(y, m - 1, d).getDay() : -1;
  return (evening || wd === 0 || wd === 6 || (wd >= 0 && isStatutoryHoliday(new Date(y, m - 1, d)))) ? 'overtime' : 'normal';
}

/**
 * 周提交开放校验（⚠️ 一周只提交一次，禁半周/未来周提交）：
 *   目标周在「周日 20:30」之后才允许提交（服务端本地时区=北京，对齐周日 20:30 提交提醒=该周推送提交信息的时刻）；
 *   此前提交该周或未来周记录一律拒绝。
 * @param dateStr 记录日期 YYYY-MM-DD
 */
function assertWeekSubmittable(dateStr: string): void {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!(Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d))) return; // 非法日期由日期校验兜底
  const dayNum = new Date(y, m - 1, d).getDay() || 7; // ISO 周一=1…周日=7
  const opensAt = new Date(y, m - 1, d + (7 - dayNum), 20, 30, 0, 0); // 该周周日 20:30（本地时区）
  if (new Date() < opensAt) throw new AppError(400, '该周还未到提交时间：周工时须等周日 20:30 提交提醒后整周一次提交');
}

/** 校验日期为真实历法日期（格式 + 回验，拦截 2026-02-30/2026-13-01 等越界日期） */
function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ⚠️ M4 修复：工时登录端点同样加限速（此前只有主 /auth/login 限速，此处可被暴力破解）
const trLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登录尝试过于频繁，请 15 分钟后再试' }, // 与主登录限速一致返回 { error }，前端统一解析
});

// ─── 认证 ────────────────────────────────────────────

/** POST /api/v1/timerecording/auth/login */
router.post('/auth/login', trLoginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, '请输入账号和密码');

    const result = await query(
      `SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.permissions, u.title,
              p.employee_id, p.name, p.role as tr_role
       FROM public.users u
       LEFT JOIN timerecording.profiles p ON p.id = u.id
       WHERE u.email = $1 AND u.is_active = true AND (p.is_active IS NOT FALSE)`,
      [email]
    );

    const user = result.rows[0];
    if (!user) throw new AppError(401, '账号或密码错误');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, '账号或密码错误');

    // ⚠️ 跨应用登录权限：销售经理仅限报价·交付应用，禁止登录工时系统
    if (user.title === '销售经理' && user.role !== 'admin' && user.role !== 'director') {
      throw new AppError(403, '该账号仅限登录报价和交付管理应用，无权使用工时系统');
    }

    // 如果没有 profile 则创建
    if (!user.tr_role) {
      const empId = user.email.split('@')[0];
      await query(
        `INSERT INTO timerecording.profiles (id, employee_id, name, email, role)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [user.id, empId, user.display_name, user.email,
         user.role === 'director' || user.role === 'admin' ? 'admin' : 'employee']
      );
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        employeeId: user.employee_id || user.email.split('@')[0],
        name: user.name || user.display_name,
        role: user.tr_role || (user.role === 'director' || user.role === 'admin' ? 'admin' : 'employee'),
        // ⚠️ 工时角色：director(总监)/manager(方案·交付经理)/employee(普通员工)
        trRole: trRoleOf({ role: user.role, permissions: user.permissions }),
      },
    });
  } catch (err) { next(err); }
});

/** GET /api/v1/timerecording/auth/me */
router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const u = req.user!;
    const result = await query(
      `SELECT u.id, u.email, u.display_name, u.title,
              p.employee_id, p.name, p.role, p.is_active
       FROM public.users u
       LEFT JOIN timerecording.profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [u.userId]
    );
    if (result.rows.length === 0) throw new AppError(404, '用户不存在');
    const r = result.rows[0];
    // ⚠️ 跨应用登录权限：销售经理仅限报价·交付应用（已持有旧 token 也在此拦截并登出）
    if (r.title === '销售经理' && req.user!.role !== 'admin' && req.user!.role !== 'director') {
      throw new AppError(403, '该账号仅限登录报价和交付管理应用，无权使用工时系统');
    }
    res.json({
      id: r.id, email: r.email,
      displayName: r.display_name,
      employeeId: r.employee_id || r.email.split('@')[0],
      name: r.name || r.display_name,
      role: r.role || 'employee',
      // ⚠️ 工时角色：req.user 含 JWT role 与每请求加载的 permissions
      trRole: trRoleOf({ role: req.user!.role, permissions: req.user!.permissions }),
    });
  } catch (err) { next(err); }
});

// ─── 用户档案 ──────────────────────────────────────

// ⚠️ 全员档案列表：管理员看全字段；非管理员仅返回 id/employee_id/name/is_active/created_at（供任务规划/我的账户展示，
//   不泄漏邮箱/角色——平衡隐私与任务规划需要全员名单；created_at=系统注册日，个人统计开工率应出勤起点需要）
//   is_director（派生，所有角色可见）：EXISTS 查预算 users 按 email 判定 role='director'，供仪表盘开工率分母剔除部门总监应出工工时；
//   恒为布尔（未匹配到 users 也返回 false，不产生 NULL）；仅暴露「是否总监」布尔，不额外暴露 role/email。
router.get('/profiles', requireAuth, async (req, res, next) => {
  try {
    const admin = isTrAdmin(req.user);
    const select = admin ? 'p.id, p.employee_id, p.name, p.email, p.role, p.is_active, p.created_at' : 'p.id, p.employee_id, p.name, p.is_active, p.created_at';
    const rows = (await query(
      `SELECT ${select}, EXISTS (
                SELECT 1 FROM users u
                 WHERE lower(u.email) = lower(p.email) AND u.role = 'director'
              ) AS is_director
         FROM timerecording.profiles p
        ORDER BY p.name`
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/profiles/:id', requireAuth, async (req, res, next) => {
  try {
    // ⚠️ 归属校验：只能看自己的档案（email/role 属隐私）；管理员可看任意档案
    const user = req.user!;
    const admin = isTrAdmin(user);
    if (req.params.id !== user.userId && !admin) throw new AppError(403, '无权查看他人档案');
    const rows = (await query('SELECT id, employee_id, name, email, role, is_active, created_at FROM timerecording.profiles WHERE id = $1', [req.params.id])).rows;
    if (!rows[0]) throw new AppError(404, '档案未找到');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/profiles/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：只能改自己的档案；role/is_active 等管理字段仅管理员可改（此前任意用户可改任意档案含角色）
    if (req.params.id !== user.userId && !admin) throw new AppError(403, '无权修改他人档案');
    if (['role', 'is_active'].some(f => f in req.body) && !admin) throw new AppError(403, '仅管理员可修改角色/启用状态');
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of ['name', 'email', 'role', 'is_active']) {
      if (req.body[f] !== undefined) { fields.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!fields.length) throw new AppError(400, '没有要更新的字段');
    values.push(req.params.id);
    const r = (await query(
      `UPDATE timerecording.profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, employee_id, name, email, role, is_active`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, '未找到');
    res.json(r);
  } catch (err) { next(err); }
});

// ─── 成本中心 ─────────────────────────────────────

/**
 * 可用成本中心清单（按类型分组）：
 *   sales / project —— 预算库实时数据（sales_opportunities -S、delivery_projects -E）
 *   warranty / department / personal —— 工时应用码表 timerecording.cost_centers（自动补建）
 */
router.get('/cost-centers', requireAuth, async (req, res, next) => {
  try {
    const { fy } = req.query as Record<string, string>;
    const fyLabel = (fy && /^FY\d{4}$/.test(fy)) ? fy : fiscalYearLabel();

    // 可用财年窗口：6 月提前生成下一年、7 月老财年可用 → 该集合内的部门/个人中心才返回
    const available = availableCostCenterFys();
    // 仅当请求财年不在可用窗口（如查看已归档/未生成财年）才补建码表；
    // 可用窗口内的码表由启动 + 每小时同步保证存在，纯读请求不触发写库
    if (!available.includes(fyLabel)) {
      await ensureCostCenters(Array.from(new Set([fyLabel, ...available, ...recentFiscalYears(3)])));
    }

    // 部门/个人/请休假仅在「请求财年 ∈ 可用窗口」时返回，否则为空数组（已归档/未生成不可用）；
    // typeRows 统一三类码表查询（type 恒为代码内固定字面量，参数化无注入面）
    const typeRows = (type: 'department' | 'personal' | 'leave') => available.includes(fyLabel)
      ? query(`SELECT code, name FROM timerecording.cost_centers WHERE type = $1 AND fy = $2 ORDER BY code`, [type, fyLabel])
      : Promise.resolve({ rows: [] });

    const [salesRows, projectRows, warrantyRows, deptRows, personalRows, leaveRows] = await Promise.all([
      query(`SELECT sales_no, project_name, client_name FROM sales_opportunities WHERE sales_no LIKE 'A%-S' ORDER BY sales_no`),
      query(`SELECT sales_no, project_name, client_name FROM delivery_projects WHERE sales_no LIKE 'A%-E' ORDER BY sales_no`),
      query(`
        SELECT cc.code, cc.name,
               (SELECT dp.client_name FROM delivery_projects dp
                 WHERE dp.sales_no = regexp_replace(cc.code, '-W$', '-E') LIMIT 1) AS client_name
        FROM timerecording.cost_centers cc
        WHERE cc.type = 'warranty' ORDER BY cc.code`),
      typeRows('department'),
      typeRows('personal'),
      typeRows('leave'),
    ]);

    res.json({
      fy: fyLabel,
      types: {
        sales: salesRows.rows.map(r => ({ code: r.sales_no, name: r.project_name, clientName: r.client_name })),
        project: projectRows.rows.map(r => ({ code: r.sales_no, name: r.project_name, clientName: r.client_name })),
        warranty: warrantyRows.rows.map(r => ({ code: r.code, name: r.name, clientName: r.client_name })),
        department: deptRows.rows.map(r => ({ code: r.code, name: r.name })),
        personal: personalRows.rows.map(r => ({ code: r.code, name: r.name })),
        leave: leaveRows.rows.map(r => ({ code: r.code, name: r.name })),
      },
    });
  } catch (err) { next(err); }
});

// ─── 工时记录 ──────────────────────────────────────

/** 列表（支持按用户/日期/周筛选） */
router.get('/time-records', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可读全员（综合分析需要）；普通员工仅本人
    const manager = isManager(user);
    const { user_id, date_from, date_to, year, week_number, status, status_in, cost_center } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (manager) {
      if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
    } else {
      conditions.push(`user_id = $${idx++}`); params.push(user.userId);
    }
    if (date_from) { conditions.push(`date >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`date <= $${idx++}`); params.push(date_to); }
    if (year) {
      const y = parseInt(year as string, 10);
      if (!Number.isInteger(y)) throw new AppError(400, 'year 格式无效');
      conditions.push(`year = $${idx++}`); params.push(y);
    }
    if (week_number) {
      const w = parseInt(week_number as string, 10);
      if (!Number.isInteger(w)) throw new AppError(400, 'week_number 格式无效');
      conditions.push(`week_number = $${idx++}`); params.push(w);
    }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (status_in) {
      // 一次查多个状态（如已审核历史需 approved + rejected），逗号分隔
      const list = String(status_in).split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) { conditions.push(`status = ANY($${idx++})`); params.push(list); }
    }
    if (cost_center) { conditions.push(`cost_center = $${idx++}`); params.push(cost_center); }

    const sql = `SELECT * FROM timerecording.time_records${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY date DESC, created_at DESC`;
    const rows = (await query(sql, params)).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/time-records', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监/管理员也可填报工时（2026-08-06 需求调整，此前按"总监不填报"做了 403 限制）
    const { date, start_time, end_time, cost_center, cost_center_type, task_description } = req.body;
    // 所有用户只能为自己建记录（此前可传任意 user_id 代建）
    const targetUserId = user.userId;
    if (!targetUserId || !isValidDateStr(date) || toMinutes(start_time) == null || toMinutes(end_time) == null) {
      throw new AppError(400, '缺少必填字段或日期/时间格式无效');
    }
    // ⚠️ S4 修复：hours/hour_type 服务端权威重算，不信任前端传入值
    const hours = serverHours(start_time, end_time);
    const hour_type = serverHourType(date, start_time, end_time);
    // ⚠️ 同思路：year/week_number 服务端按 date 重算 ISO 周（跨年/跨周边界与前端 dayjs 一致），忽略前端值
    const iso = isoWeekOf(date);
    // 成本中心存在性 + 类型枚举 + 文本长度（与任务侧一致；工时侧允许部门中心、空成本中心放行）
    await assertTimeCostCenterValid(cost_center);
    if (cost_center_type != null && !TIME_COST_CENTER_TYPES.includes(cost_center_type)) {
      throw new AppError(400, 'cost_center_type 无效');
    }
    // 请休假硬性校验（POST/PUT 共用 assertLeaveValid）：晚班/周末/节假日拒绝；单日合计 ≤ 8 小时
    await assertLeaveValid({ userId: targetUserId, date, hours, hourType: hour_type, code: cost_center, type: cost_center_type });
    const desc = typeof task_description === 'string' ? task_description : '';
    if (desc.length > 500) throw new AppError(400, '工作内容不能超过 500 字');

    const r = (await query(
      `INSERT INTO timerecording.time_records (user_id, date, week_number, year, start_time, end_time, hours, hour_type, cost_center, cost_center_type, task_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [targetUserId, date, iso.week, iso.year, start_time, end_time, hours, hour_type, cost_center || null, cost_center_type || null, desc]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：status 不能直接改（须走 /submit 与 /review 审批流程），移除出可更新字段；
    //   week_number/year 也移除：由 date 服务端重算，不信任前端
    const fields = ['date', 'start_time', 'end_time', 'cost_center', 'cost_center_type', 'task_description'];
    // ⚠️ S4 修复：先取当前行，合并入请求字段后由服务端重算 hours/hour_type（不信任前端）；
    //   带 user_id/cost_center/cost_center_type 供请休假校验判断记录归属与类型（合并后口径）
    const existing = (await query(
      `SELECT user_id, date, start_time, end_time, hours, hour_type, cost_center, cost_center_type FROM timerecording.time_records WHERE id = $1${admin ? '' : ' AND user_id = $2'}`,
      admin ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!existing) throw new AppError(404, admin ? '记录不存在' : '记录不存在或无权修改');
    // 合并前校验新字段格式（防 500 与脏数据；与 POST 同口径）
    if (req.body.date !== undefined && !isValidDateStr(req.body.date)) throw new AppError(400, '日期格式无效');
    if (req.body.start_time !== undefined && toMinutes(req.body.start_time) == null) throw new AppError(400, '开始时间格式无效');
    if (req.body.end_time !== undefined && toMinutes(req.body.end_time) == null) throw new AppError(400, '结束时间格式无效');
    if (req.body.cost_center !== undefined) await assertTimeCostCenterValid(req.body.cost_center);
    if (req.body.cost_center_type != null && !TIME_COST_CENTER_TYPES.includes(req.body.cost_center_type)) {
      throw new AppError(400, 'cost_center_type 无效');
    }
    if (typeof req.body.task_description === 'string' && req.body.task_description.length > 500) {
      throw new AppError(400, '工作内容不能超过 500 字');
    }
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    // 合并后重算：起止时间或日期任一变化都要保证 hours/hour_type 服务端权威；
    // 时间缺失（旧数据）时保留原值，不重算成 0
    const merged = { ...existing, ...req.body };
    const hasTimes = merged.start_time != null && merged.end_time != null;
    const recomputedHours = hasTimes ? serverHours(merged.start_time, merged.end_time) : existing.hours;
    const recomputedHourType = hasTimes ? serverHourType(merged.date, merged.start_time, merged.end_time) : existing.hour_type;
    // 请休假硬性校验（合并后口径，用记录真实类型/编码判断；排除本行）：晚班/周末/节假日拒绝；单日合计 ≤ 8 小时
    await assertLeaveValid({
      userId: existing.user_id, date: merged.date, hours: recomputedHours,
      hourType: recomputedHourType, code: merged.cost_center, type: merged.cost_center_type,
      excludeId: req.params.id,
    });
    updates.push(`hours = $${idx++}`, `hour_type = $${idx++}`);
    values.push(recomputedHours, recomputedHourType);
    // ⚠️ year/week_number 由 date 服务端权威重算（忽略前端值）
    const iso = isoWeekOf(merged.date);
    updates.push(`year = $${idx++}`, `week_number = $${idx++}`);
    values.push(iso.year, iso.week);
    // ⚠️ 工作流优化：驳回记录允许编辑修正，编辑后自动回到 draft（可重新提交）
    // ⚠️ 审计修复：驳回记录编辑回草稿时必须同步清空 submitted_at（draft 语义=未提交，
    //   否则残留"草稿带提交时间"的数据异常，撤回判定/历史口径会失真）
    updates.push(
      `status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END`,
      `submitted_at = CASE WHEN status = 'rejected' THEN NULL ELSE submitted_at END`
    );
    values.push(req.params.id);
    // 归属校验：非管理员只能改自己的记录
    if (!admin) values.push(user.userId);
    // 已提交/已审核通过/已锁定记录不可直改（submitted 须先撤回、approved 须通过撤回通道回草稿后修改）
    const r = (await query(
      `UPDATE timerecording.time_records SET ${updates.join(', ')} WHERE id = $${idx}${admin ? '' : ` AND user_id = $${idx + 1}`} AND status NOT IN ('submitted', 'approved', 'locked') RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(400, admin ? '记录不存在、已提交/已通过或已锁定' : '记录不存在、无权修改、已提交/已通过或已锁定');
    res.json(r);
  } catch (err) { next(err); }
});

/** 撤回提交（→ draft，仅本人）
 *  ⚠️ 规则（与用户约定一致）：① 提交后 30 天内未审核可撤回；② 审批通过后 30 天内也可撤回（改后重新提交审核）。
 *  撤回已通过记录时清空审核链（reviewed_by/reviewed_at/review_notes/submitted_at，draft 语义=未提交）
 *  并通知原审核人（其审批被撤回，须知情）。
 *  ⚠️ S3 修复：前端按 `30 * 24h` 判定可撤回，此前后端用 interval '1 month'（漂移 1~3 天），统一为 30 天 */
router.put('/time-records/:id/withdraw', requireAuth, async (req, res, next) => {
  try {
    const uid = req.user!.userId;
    // 先取当前态，确定是否需通知原审核人（UPDATE 后再查会因状态已变而无法区分 submitted/approved 来源）
    const before = (await query(
      `SELECT status, reviewed_by, year, week_number FROM timerecording.time_records WHERE id = $1 AND user_id = $2`,
      [req.params.id, uid]
    )).rows[0];
    if (!before) throw new AppError(404, '记录不存在或无权撤回');
    const r = (await query(
      `UPDATE timerecording.time_records
         SET status = 'draft', submitted_at = NULL, reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL
       WHERE id = $1 AND user_id = $2 AND (
         (status = 'submitted' AND submitted_at >= now() - interval '30 days')
         OR (status = 'approved' AND reviewed_at >= now() - interval '30 days'))
       RETURNING *`,
      [req.params.id, uid]
    )).rows[0];
    if (!r) throw new AppError(400, '只能撤回自己提交后 30 天内未审核、或审批通过后 30 天内的记录');
    // 撤回已通过记录 → 通知原审核人（其已做出的审批被撤回）
    if (before.status === 'approved' && before.reviewed_by) {
      try {
        const name = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [uid])).rows[0]?.name || '员工';
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
           VALUES ($1, $2, $3, 'withdraw', '/admin/approval')`,
          [before.reviewed_by, '工时已撤回', `${name} 撤回了第 ${before.year}W${before.week_number} 周已通过的工时，将修改后重新提交审核`]
        );
      } catch (err) { console.error('撤回已通过记录的审核人通知失败:', err); }
    }
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/time-records/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    // ⚠️ F6 修复：归属校验，非管理员只能删自己的记录
    // ⚠️ M2 修复：状态守卫——仅 draft/rejected 可删；已提交/已审核/已锁定记录禁止删除，防破坏工时审计链
    //   （rejected 允许删除：驳回记录可修正后重交，也可整行移除，语义一致）
    const r = (await query(
      `DELETE FROM timerecording.time_records WHERE id = $1${admin ? '' : ' AND user_id = $2'} AND status IN ('draft','rejected') RETURNING id`,
      admin ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, admin ? '记录不存在或已提交/已审核，不可删除' : '记录不存在、无权删除或已提交/已审核，不可删除');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 审批 ──────────────────────────────────────────

/** 提交审核（⚠️ F6 补漏：只能提交自己的草稿记录；submitted_at 供「30 天内可撤回」判定）
 *  ⚠️ 周推送规则：目标周周日 20:30 前不可提交（禁半周/未来周提交）——先取记录日期校验，避免先改后拒 */
router.put('/time-records/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const rec = (await query(
      `SELECT date FROM timerecording.time_records WHERE id = $1 AND status = 'draft' AND user_id = $2`,
      [req.params.id, req.user!.userId]
    )).rows[0];
    if (rec) assertWeekSubmittable(String(rec.date).slice(0, 10));
    const r = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted', submitted_at = now()
       WHERE id = $1 AND status = 'draft' AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.userId]
    )).rows[0];
    if (!r) throw new AppError(400, '只能提交自己的草稿记录');
    res.json(r);
  } catch (err) { next(err); }
});

/** 批量提交（⚠️ F6 补漏：只能提交自己的草稿记录） */
router.post('/time-records/submit-batch', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!isValidUuidArray(ids)) throw new AppError(400, 'ids 必填且须为 uuid 数组');
    // ⚠️ 周推送规则：目标周周日 20:30 前不可提交——先校验所有草稿记录所在周，再变更（防半途拒绝留下半提交态）
    const weeks = (await query(
      `SELECT DISTINCT date FROM timerecording.time_records WHERE id = ANY($1::uuid[]) AND status = 'draft' AND user_id = $2`,
      [ids, req.user!.userId]
    )).rows;
    weeks.forEach((w: any) => assertWeekSubmittable(String(w.date).slice(0, 10)));
    const rows = (await query(
      `UPDATE timerecording.time_records SET status = 'submitted', submitted_at = now()
       WHERE id = ANY($1::uuid[]) AND status = 'draft' AND user_id = $2 RETURNING *`,
      [ids, req.user!.userId]
    )).rows;
    // ⚠️ 工作流优化：提交成功后自动通知所有管理员（移除前端轮询全员列表找 admin 的依赖）
    if (rows.length > 0) {
      try {
        const admins = (await query(`SELECT id FROM timerecording.profiles WHERE role = 'admin' AND is_active = true`)).rows;
        if (admins.length > 0) {
          const weekLabel = `${rows[0].year}W${rows[0].week_number}`;
          const totalHours = rows.reduce((s: number, r: any) => s + parseFloat(r.hours || 0), 0);
          const submitter = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [req.user!.userId])).rows[0]?.name || '员工';
          // 单条 INSERT 覆盖全部管理员（替代 for 循环 N 次往返）
          await query(
            `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
             SELECT a.id, $1, $2, 'submission', '/admin/approval'
             FROM timerecording.profiles a
             WHERE a.id = ANY($3::uuid[]) AND a.is_active = true`,
            [`${submitter} 提交了工时`, `第 ${weekLabel} 周 · 共 ${totalHours}h`, admins.map(a => a.id)]
          );
        }
      } catch (_) { /* 通知失败不影响提交主流程 */ }
    }
    res.json(rows);
  } catch (err) { next(err); }
});

/** 给被审记录所属员工发一条审核结果通知 */
async function notifyReview(r: any, action: string, review_notes?: string) {
  try {
    const weekLabel = `${r.year}W${r.week_number}`;
    await query(
      `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url)
       VALUES ($1, $2, $3, $4, '/time-record')`,
      [r.user_id, action === 'approved' ? '工时已通过' : '工时已驳回',
       `第 ${weekLabel} 周${review_notes ? ' · 备注: ' + review_notes : ''}`,
       action === 'approved' ? 'approval' : 'rejection']
    );
  } catch (_) { /* 通知失败不影响审批主流程 */ }
}

/** 审批通过/驳回（⚠️ F6 补漏：审批是管理员操作，防止任意用户代审/自审） */
router.put('/time-records/:id/review', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { action, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, '操作必须是 approved 或 rejected');
    if (typeof review_notes === 'string' && review_notes.length > 500) throw new AppError(400, '审核备注不能超过 500 字');
    const reviewer = req.user!;
    // ⚠️ 产品决策：总监一般不填报工时，若填报可自审（撤销此前 user_id<>reviewer 自审防护）
    const r = (await query(
      `UPDATE timerecording.time_records SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = $4 AND status = 'submitted' RETURNING *`,
      [action, review_notes || '', reviewer.userId, req.params.id]
    )).rows[0];
    if (!r) throw new AppError(400, '只能审核已提交的记录');
    await notifyReview(r, action, review_notes);
    res.json(r);
  } catch (err) { next(err); }
});

/** 批量审批（管理员）：一次审批一组记录（如同一员工同一周），原子完成，只发一条通知 */
router.post('/time-records/review-batch', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { ids, action, review_notes } = req.body;
    if (!isValidUuidArray(ids)) throw new AppError(400, 'ids 必填且须为 uuid 数组');
    if (!['approved', 'rejected'].includes(action)) throw new AppError(400, '操作必须是 approved 或 rejected');
    if (typeof review_notes === 'string' && review_notes.length > 500) throw new AppError(400, '审核备注不能超过 500 字');
    const reviewer = req.user!;
    client = await getClient();
    await client.query('BEGIN');
    // ⚠️ 审计修复：批审须保证 周原子性 —— 所有记录同一员工同一周、且全部处于 submitted。
    //   此前 UPDATE 静默跳过非 submitted 的 id，可能造成"部分审批"，跨员工/跨周混批还会让
    //   单条通知口径失真。前端按 user+week 分组调用，正常不会触发；此处作为纵深防御显式 400。
    const before = (await client.query(
      `SELECT user_id, year, week_number, status FROM timerecording.time_records WHERE id = ANY($1::uuid[])`,
      [ids]
    )).rows;
    if (before.length !== ids.length) throw new AppError(400, '部分记录不存在');
    if (before.some((b: any) => b.status !== 'submitted')) throw new AppError(400, '批审记录须全部处于待审核状态');
    const batchUsers = new Set(before.map((b: any) => b.user_id));
    const batchWeeks = new Set(before.map((b: any) => `${b.year}-${b.week_number}`));
    if (batchUsers.size !== 1 || batchWeeks.size !== 1) throw new AppError(400, '批审记录须属于同一员工同一周');
    const rows = (await client.query(
      `UPDATE timerecording.time_records SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = ANY($4::uuid[]) AND status = 'submitted' RETURNING *`,
      [action, review_notes || '', reviewer.userId, ids]
    )).rows;
    await client.query('COMMIT');
    if (rows.length > 0) {
      const totalHours = rows.reduce((s: number, r: any) => s + parseFloat(r.hours || 0), 0);
      await notifyReview({ ...rows[0], user_id: rows[0].user_id }, action, `${review_notes || ''}${rows.length > 1 ? `（共 ${rows.length} 条，${totalHours}h）` : ''}`);
    }
    res.json(rows);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// ─── 任务分配 ──────────────────────────────────────

router.get('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可看全员任务（规划甘特）；普通员工仅自己
    const manager = isManager(user);
    const { user_id, status, start, end } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (manager) {
      if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
    } else {
      conditions.push(`user_id = $${idx++}`); params.push(user.userId);
    }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    // ⚠️ 窗口过滤：只返回与 [start, end] 有交集的任务（甘特按 14 周窗口拉取，避免全量返回 + 窗口外任务条撑高行高）
    if (start) { conditions.push(`end_datetime >= $${idx++}`); params.push(start); }
    if (end) { conditions.push(`start_datetime <= $${idx++}`); params.push(end); }
    const sql = `SELECT * FROM timerecording.task_assignments${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY start_datetime`;
    res.json((await query(sql, params)).rows);
  } catch (err) { next(err); }
});

router.post('/task-assignments', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 给他人派任务是 总监/方案经理/交付经理 权限；普通员工只能给自己建任务
    const manager = isManager(user);
    const { user_id, task_name, color, start_datetime, end_datetime, status, note, cost_center } = req.body;
    const targetUserId = (manager && user_id) ? user_id : user.userId;
    // ⚠️ 输入边界：task_name/note 列均为 text 无 DB 约束，须应用层校验（与前端 maxLength 对齐）
    if (typeof task_name === 'string' && task_name.length > 100) throw new AppError(400, '任务名称不能超过 100 字');
    if (typeof note === 'string' && note.length > 500) throw new AppError(400, '备注不能超过 500 字');
    // ⚠️ 成本中心必须存在（含部门/个人可用财年窗口校验），否则拒绝派任务
    await assertCostCenterValid(cost_center);
    const r = (await query(
      `INSERT INTO timerecording.task_assignments (user_id, task_name, color, start_datetime, end_datetime, status, created_by, note, cost_center)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [targetUserId, task_name, color, start_datetime, end_datetime, status || 'in_progress', user.userId, note || '', cost_center || null]
    )).rows[0];
    // ⚠️ 任务推送：管理员派给他人的任务，自动通知该员工
    if (r && targetUserId !== user.userId) {
      try {
        const assigner = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [user.userId])).rows[0]?.name || '管理员';
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url, task_id)
           VALUES ($1, $2, $3, 'task', '/task-planning', $4)`,
          [targetUserId, '您有新任务', `${assigner} 分配了任务「${r.task_name}」`, r.id]
        );
      } catch (_) { /* 通知失败不影响派任务 */ }
    }
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.put('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可编辑他人任务；普通员工只能改自己的
    const manager = isManager(user);
    const fields = ['task_name', 'color', 'start_datetime', 'end_datetime', 'status', 'note', 'history', 'cost_center'];
    // ⚠️ 先取旧状态，用于通知判定（对比状态是否变化）
    const old = (await query(
      `SELECT * FROM timerecording.task_assignments WHERE id = $1${manager ? '' : ' AND user_id = $2'}`,
      manager ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!old) throw new AppError(404, manager ? '任务不存在' : '任务不存在或无权修改');

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        // ⚠️ history 是 jsonb 列：node-postgres 会把 JS 数组序列化成 PG 数组字面量 `{...}`（非 JSON），
        //   直接传值会导致 jsonb 解析失败（22P02 Expected ":", but found "}"）。
        //   与 approvals/deliveries/opportunities 写 jsonb 的先例一致，先 JSON.stringify。
        values.push(f === 'history' && req.body[f] !== null ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!updates.length) throw new AppError(400, '没有要更新的字段');
    // ⚠️ 输入边界：task_name/note 列均为 text 无 DB 约束，须应用层校验（与前端 maxLength 对齐）
    //   typeof 判字符串：null/数字等非字符串一律不触长度检查，避免 null.length 抛 500
    if (typeof req.body.task_name === 'string' && req.body.task_name.length > 100) throw new AppError(400, '任务名称不能超过 100 字');
    if (typeof req.body.note === 'string' && req.body.note.length > 500) throw new AppError(400, '备注不能超过 500 字');
    // ⚠️ 改成本中心时必须存在（含个人中心可用财年窗口）；未改动（与旧值一致）则跳过——
    //    存量任务可能引用已从预算库消失的中心（如已归档销售单），未改动时不应阻止保存其他字段
    if (req.body.cost_center !== undefined && req.body.cost_center !== old.cost_center) {
      await assertCostCenterValid(req.body.cost_center);
    }
    values.push(req.params.id);
    if (!manager) values.push(user.userId);
    const r = (await query(
      `UPDATE timerecording.task_assignments SET ${updates.join(', ')} WHERE id = $${idx}${manager ? '' : ` AND user_id = $${idx + 1}`} RETURNING *`,
      values
    )).rows[0];
    if (!r) throw new AppError(404, manager ? '未找到' : '任务不存在或无权修改');

    // ⚠️ 任务工作流通知（完整规划）：
    //  1) 管理员改派/编辑他人任务 → 推送「任务更新」给被分配员工
    //  2) 状态变更为反馈态（已完成/被取消/被推迟/已延误）→ 反馈给派发人（自身除外）
    const FEEDBACK_STATES = ['completed', 'cancelled', 'postponed', 'delayed'];
    if (r.user_id !== user.userId) {
      try {
        const assigner = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [user.userId])).rows[0]?.name || '管理员';
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url, task_id)
           VALUES ($1, $2, $3, 'task', '/task-planning', $4)`,
          [r.user_id, '任务更新', `${assigner} 更新了任务「${r.task_name}」${req.body.note ? '：' + req.body.note : ''}`, r.id]
        );
      } catch (_) { /* 通知失败不影响更新 */ }
    }
    if (req.body.status && req.body.status !== old.status && FEEDBACK_STATES.includes(req.body.status) && r.created_by !== user.userId) {
      try {
        // 仅在需要发反馈通知时才查被分配员工姓名（此前无条件查询，纯读请求也多做一次往返）
        const empName = (await query('SELECT name FROM timerecording.profiles WHERE id = $1', [r.user_id])).rows[0]?.name || '员工';
        const statusLabel: Record<string, string> = { completed: '已完成', cancelled: '被取消', postponed: '被推迟', delayed: '已延误' };
        const label = statusLabel[req.body.status as string];
        await query(
          `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url, task_id)
           VALUES ($1, $2, $3, 'task_feedback', '/task-planning', $4)`,
          [r.created_by, `任务${label}`, `${empName} 将「${r.task_name}」标记为${label}${req.body.note ? '：' + req.body.note : ''}`, r.id]
        );
      } catch (_) { /* 通知失败不影响状态更新 */ }
    }
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/task-assignments/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // ⚠️ 总监 + 方案/交付经理可删除他人任务；普通员工只能删自己的
    const manager = isManager(user);
    const r = (await query(
      `DELETE FROM timerecording.task_assignments WHERE id = $1${manager ? '' : ' AND user_id = $2'} RETURNING id`,
      manager ? [req.params.id] : [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, manager ? '记录不存在' : '任务不存在或无权删除');
    // ⚠️ 级联清理该任务的关联通知（无 FK，软引用；避免孤儿通知指向已删除任务）
    await query('DELETE FROM timerecording.notifications WHERE task_id = $1', [r.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 通知 ──────────────────────────────────────────

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const rows = (await query(
      'SELECT * FROM timerecording.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user.userId]
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

// ⚠️ 查看后消除：点击通知即删除（替代旧的「标记已读」——已读通知仍留库会随使用持续累积）。
//   通知是可消费的指针（审批/任务/提醒的跳转入口），底层业务数据（工时/任务）均独立持久化，删除通知无数据损失。
router.delete('/notifications/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    // F6 约束延续：只能删除自己的通知
    const r = (await query(
      'DELETE FROM timerecording.notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, user.userId]
    )).rows[0];
    if (!r) throw new AppError(404, '通知不存在');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── 通知写入（替代 RPC） ──────────────────────────

router.post('/notifications', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const admin = isTrAdmin(user);
    const { user_id, title, message: msg, type, link_url } = req.body;
    // ⚠️ F6 修复：给他人发通知是管理/系统操作；非管理员只能给自己建
    const targetUserId = (admin && user_id) ? user_id : user.userId;
    // ⚠️ 审计修复：type 对齐 DB CHECK 枚举（不符会撞约束返回 500）+ 标题/消息长度边界（title 为 NOT NULL，
    //   undefined/超长会让数据库抛错而非给出可读 400）
    const resolvedType = type || 'submission';
    if (!NOTIFICATION_TYPES.includes(resolvedType)) throw new AppError(400, 'type 无效');
    if (typeof title !== 'string' || !title.trim() || title.length > 100) throw new AppError(400, '标题不能为空且不超过 100 字');
    if (typeof msg === 'string' && msg.length > 1000) throw new AppError(400, '消息内容不能超过 1000 字');
    const r = (await query(
      `INSERT INTO timerecording.notifications (user_id, title, message, type, link_url) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [targetUserId, title, msg || '', type || 'submission', link_url]
    )).rows[0];
    res.status(201).json(r);
  } catch (err) { next(err); }
});

// ─── 管理员功能 ──────────────────────────────────

/** 管理员创建用户（补 profile + users 表） */
router.post('/admin/users', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { email, name, password, employee_id, role = 'employee' } = req.body;
    if (!email || !name || !password) throw new AppError(400, '缺少必填字段');
    if (password.length < 8) throw new AppError(400, '密码至少8个字符'); // 与主用户管理/reset-password 口径统一
    // ⚠️ L4 修复：重复邮箱预检，避免撞唯一约束返回笼统错误（与 users.ts 口径一致）
    const dup = (await query('SELECT id FROM public.users WHERE email = $1', [email])).rows[0];
    if (dup) throw new AppError(409, '该邮箱已被注册');

    const passwordHash = await bcrypt.hash(password, 10);
    const empId = employee_id || email.split('@')[0];
    // ⚠️ F14 修复：users + profiles 两步写放入同一事务，避免中途失败留下"有 users 无 profile"半成品
    client = await getClient();
    await client.query('BEGIN');
    const user = (await client.query(
      `INSERT INTO public.users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, name, passwordHash, 'user']
    )).rows[0];
    await client.query(
      `INSERT INTO timerecording.profiles (id, employee_id, name, email, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, empId, name, email, role]
    );
    await client.query('COMMIT');

    res.status(201).json({ id: user.id, email, name, employee_id: empId, role });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

/** 管理员重置密码 */
router.post('/admin/users/:id/reset-password', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    // ⚠️ L7 修复：密码策略与主用户管理统一为至少 8 位（此前此处 6 位、users.ts 8 位，口径不一致）
    if (!password || password.length < 8) throw new AppError(400, '密码至少8个字符');
    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE public.users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    logAudit(req, '重置密码', 'admin', '用户 ' + id.slice(0,8) + ' 密码已重置');
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** 管理员删除用户 */
router.delete('/admin/users/:id', requireAuth, requireRole('director', 'admin'), async (req, res, next) => {
  let client: any;
  try {
    const { id } = req.params;
    // ⚠️ 自删保护：防止误删当前登录账号导致全员锁死（唯一管理员被删后无人可再管理）
    if (id === req.user!.userId) throw new AppError(400, '不能删除自己的账号');
    // ⚠️ F14 修复：profiles + users 两步删除放入同一事务，避免中途失败留下"有 profile 无 users"半成品
    // ⚠️ M5 修复：先清空以该用户为 reviewer/创建者的引用（无 ON DELETE 动作会 FK 阻塞删除），再删 profile
    client = await getClient();
    await client.query('BEGIN');
    await client.query('UPDATE timerecording.time_records SET reviewed_by = NULL WHERE reviewed_by = $1', [id]);
    await client.query('UPDATE timerecording.task_assignments SET created_by = NULL WHERE created_by = $1', [id]);
    await client.query('DELETE FROM timerecording.profiles WHERE id = $1', [id]);
    await client.query('DELETE FROM public.users WHERE id = $1', [id]);
    await client.query('COMMIT');
    logAudit(req, '删除用户', 'admin', '用户 ' + id.slice(0,8) + ' 已删除');
    res.json({ success: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

export default router;
