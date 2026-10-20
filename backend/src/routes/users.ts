import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit, objKeysToSnake, normalizeEmail, EMAIL_RE, resetUserPassword, withTransaction, assertCanManage, ROLE_RANK, PASSWORD_MAX, assertUserDeletable } from './helpers.js';
import { PAGE_LIMIT, PASSWORD_MIN } from '../constants.js';

const router = Router();

// 所有用户管理接口需要登录 + 用户管理/系统配置权限（与前端 /settings 同口径）
router.use(requireAuth);
router.use(requirePermission('用户管理', '系统配置', '全部查看权限'));

const USER_FIELDS = 'id, email, display_name, title, phone, role, is_active, created_at, permissions';

/** UUID 文本比较（大小写不敏感）：URL 参数与 JWT 中的 id 大小写可能不同（PG 的 uuid 比较本身不区分大小写），
 * 直接字符串比较会让自保护被绕过 */
const sameUserId = (a: string, b: string) => String(a).toLowerCase() === String(b).toLowerCase();

/** 职务校验：类型 + 长度 ≤50。跨应用访问限制按 title 精确匹配，PUT /:id 与 PUT /:id/role 须同口径 */
function assertTitleValue(title: unknown): void {
  if (title === undefined) return;
  if (typeof title !== 'string') throw new AppError(400, '职务必须为字符串');
  if (title.length > 50) throw new AppError(400, '职务不能超过 50 字');
}

// ── 用户管理安全常量与越级保护 ──
export const VALID_ROLES = ['admin', 'director', 'manager', 'user'];
// ROLE_RANK + assertCanManage 已收敛至 helpers.ts（users.ts 与 timerecording.ts 管理员路径共用，防双份漂移）
/** 服务端权限白名单（与 BudgetEstimateApp/src/pages/SystemManagement.tsx 的 ALL_PERMISSIONS 同源）：
 * 禁止写入白名单外的任意字符串，防"任意赋权/万能权限漂移" */
export const ALL_PERMISSIONS = [
  '仪表盘查看', '销售分析', '销售机会管理', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会',
  '销售蓝表编辑', '报价列表查看', '报价编制', '审批管理', '交付管理', '交付分析',
  '成本录入', '物料管理', '新增物料', '新建标签', '客户管理', '新建客户',
  '用户管理', '系统配置', '全部查看权限',
];
// EMAIL_RE 复用 helpers.ts（auth/users 登录与创建共用，防双份漂移）

/** 新用户输入校验（保序：必填 → 类型 → 角色白名单 → 越级保护 → 密码长度 → 邮箱格式），
 * 返回归一化邮箱（trim+小写）。仅供 POST /users 用（PUT 字段级校验内联不走此函数）
 * 越级保护在内（assertCanManage）：非 admin/director 不得创建 admin/director 账号 */
export function validateNewUserInput(input: Record<string, any>, actorRole: string): string {
  const { display_name, email, password, role = 'user' } = input;
  if (!email || !display_name || !password) {
    throw new AppError(400, '缺少必填字段：email, displayName, password');
  }
  // 类型校验（防对象/数组入参触发 PG 类型错误 500）
  if (typeof email !== 'string' || typeof display_name !== 'string' || typeof password !== 'string') {
    throw new AppError(400, '邮箱/姓名/密码必须为字符串');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(400, `无效角色，允许值：${VALID_ROLES.join(', ')}`);
  }
  assertCanManage(actorRole, ROLE_RANK[role] ?? 0);
  // 与重置路径同一常量：创建时也校验弱口令
  if (password.length < PASSWORD_MIN) {
    throw new AppError(400, `密码至少${PASSWORD_MIN}位`);
  }
  if (password.length > PASSWORD_MAX) {
    throw new AppError(400, `密码不能超过${PASSWORD_MAX}位`);
  }
  // 邮箱归一化：trim + 小写（防 ' A@x ' 注册近似重复账号；重复检测/存储均用归一化值）
  const emailNorm = normalizeEmail(email);
  if (!EMAIL_RE.test(emailNorm)) {
    throw new AppError(400, '邮箱格式无效');
  }
  return emailNorm;
}

/** 权限授予校验：① 白名单（ALL_PERMISSIONS 外或非字符串 → 400）② 委托限制——只能授予操作者自己已持有的权限（→ 403）。
 * 防"用户管理"持有者给傀儡账号赋「全部查看权限」；permissions 为 undefined 时不做校验（更新未涉权限字段） */
export function validatePermissionsGrant(permissions: unknown, actorPerms: string[]): void {
  if (!Array.isArray(permissions) || !permissions.every(p => typeof p === 'string' && ALL_PERMISSIONS.includes(p))) {
    throw new AppError(400, '权限包含无效值（白名单外或非字符串）');
  }
  const denied = (permissions as string[]).filter(p => !actorPerms.includes(p));
  if (denied.length > 0) {
    throw new AppError(403, `无权授予以下权限：${denied.join('、')}`);
  }
}

/** GET /api/users - 获取用户列表 */
router.get('/', async (_req, res, next) => {
  try {
    // 补分页上限
    const result = await query(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at ASC LIMIT $1`, [PAGE_LIMIT]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

/** POST /api/users - 创建新用户 */
router.post('/', async (req, res, next) => {
  try {
    // 统一转换为 snake_case（兼容前端 api.ts toSnake 或直接调用）
    const { display_name, email, password, title = '', phone = '', role = 'user' } = objKeysToSnake({ ...req.body });
    // 校验全部收敛至 validateNewUserInput（必填→类型→角色白名单→越级保护→密码长度→邮箱格式，返回归一化邮箱）
    const emailNorm = validateNewUserInput({ display_name, email, password, role }, req.user!.role);

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [emailNorm]);
    if (existing.rows.length > 0) {
      throw new AppError(409, '该邮箱已被注册');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // password_changed_at = now() 建号即记录改密基准，后续重置据此吊销旧 JWT（requireAuth 比对 iat）
    const result = await query(
      `INSERT INTO users (email, display_name, title, phone, password_hash, role, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING ${USER_FIELDS}`,
      [emailNorm, display_name, title, phone, passwordHash, role]
    );

    logAudit(req, '创建用户', 'user', `创建用户 ${emailNorm} (${display_name}) 角色:${role}`);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id - 更新用户信息 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { display_name, email, title, phone, is_active } = objKeysToSnake({ ...req.body });

    const existing = await query('SELECT role FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');
    // 越级保护：只能管理「角色等级 ≤ 自己」的账号（assertCanManage 依 ROLE_RANK 纯等级比较——
    // 同级可管理，仅更高等级受拒）
    assertCanManage(req.user!.role, ROLE_RANK[existing.rows[0].role] ?? 0);

    // 类型校验（防非法值触发 PG 类型错误 500）
    if (display_name !== undefined && typeof display_name !== 'string') throw new AppError(400, '姓名必须为字符串');
    assertTitleValue(title);
    // 跨应用访问限制依据 title，禁止本人修改自己的职务（否则受限账号可自助解除限制）
    if (title !== undefined && sameUserId(id, req.user!.userId)) {
      throw new AppError(403, '不能修改自己的职务');
    }
    if (phone !== undefined && typeof phone !== 'string') throw new AppError(400, '电话必须为字符串');
    if (is_active !== undefined && typeof is_active !== 'boolean') throw new AppError(400, 'is_active 必须为布尔值');

    // 邮箱归一化 + 格式校验（防近似重复与注入）
    let emailNorm: string | undefined;
    if (email !== undefined) {
      if (typeof email !== 'string') throw new AppError(400, '邮箱必须为字符串');
      emailNorm = normalizeEmail(email);
      if (!EMAIL_RE.test(emailNorm)) throw new AppError(400, '邮箱格式无效');
      const conflict = await query('SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2', [emailNorm, id]);
      if (conflict.rows.length > 0) throw new AppError(409, '该邮箱已被其他用户使用');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (display_name !== undefined) { fields.push(`display_name = $${idx++}`); values.push(display_name); }
    if (emailNorm !== undefined) { fields.push(`email = $${idx++}`); values.push(emailNorm); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) throw new AppError(400, '没有要更新的字段');
    if (is_active === false && sameUserId(id, req.user!.userId)) {
      throw new AppError(400, '不能停用自己的账号');
    }

    values.push(id);
    // 主表更新、停用保护与工时侧邮箱双写放在同一事务：任一步失败都不留半成品状态
    const updated = await withTransaction(async (client) => {
      if (is_active === false && existing.rows[0].role === 'admin') {
        // 锁住全部启用管理员行，防并发停用把最后一名管理员停掉
        const admins = (await client.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active FOR UPDATE"
        )).rows as { id: string }[];
        if (!admins.some(a => !sameUserId(a.id, id))) {
          throw new AppError(409, '系统至少需保留一个启用的管理员账号');
        }
      }
      const result = await client.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
        values
      );
      // 邮箱变更双写 timerecording.profiles（冗余展示字段，无 FK）——不同步会让工时侧
      // /auth/me 等返回旧邮箱；timerecording schema 未部署时 to_regclass 探测跳过
      if (emailNorm !== undefined) {
        const sc = (await client.query(`SELECT to_regclass('timerecording.profiles') AS p`)).rows[0];
        if (sc?.p) await client.query('UPDATE timerecording.profiles SET email = $1 WHERE id = $2', [emailNorm, id]);
      }
      return result.rows[0];
    });

    // 用户编辑/停用属敏感操作，必须留痕（提交成功后再记，避免记录未落地的变更）
    logAudit(
      req,
      is_active === false ? '停用用户' : is_active === true ? '启用用户' : '更新用户',
      'user',
      `${updated.email} ${is_active === false ? '已停用' : is_active === true ? '已启用' : '信息已更新'}`
    );

    res.json(updated);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/password - 重置密码 */
router.put('/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const existing = await query('SELECT role, email, display_name FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');
    // 越级保护：非 admin 不得重置同级/更高角色账号密码（防改密接管 admin·director）
    assertCanManage(req.user!.role, ROLE_RANK[existing.rows[0].role] ?? 0);

    // 密码长度校验/哈希/改密吊销（password_changed_at）共用 resetUserPassword（与工时重置同源）
    await resetUserPassword(id, password);

    logAudit(req, '重置密码', 'user', `用户 ${existing.rows[0].display_name || existing.rows[0].email} 密码已重置`);

    res.json({ success: true });
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/role - 修改角色（auth 角色 + title） */
router.put('/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, title, permissions } = objKeysToSnake({ ...req.body });

    // 自保护：不能修改自己的角色/权限（防持有"用户管理"权限者自提权为 admin/director）
    if (sameUserId(id, req.user!.userId)) throw new AppError(400, '不能修改自己的角色/权限');
    assertTitleValue(title);

    if (role && !VALID_ROLES.includes(role)) {
      throw new AppError(400, `无效角色，允许值：${VALID_ROLES.join(', ')}`);
    }

    const userRow = (await query('SELECT role, email, display_name FROM users WHERE id = $1', [id])).rows[0];
    if (!userRow) throw new AppError(404, '用户不存在');
    // 越级保护：① 目标当前角色 ≥ 操作者 → 不可改（防降级/改权 admin·director）；
    // ② 新角色等级 ≥ 操作者 → 不可提（防制造同级/更高账号）
    assertCanManage(req.user!.role, ROLE_RANK[userRow.role] ?? 0);
    if (role) assertCanManage(req.user!.role, ROLE_RANK[role] ?? 0);

    // permissions 白名单 + 委托限制：仅允许写白名单内权限，且只能授予操作者自己已持有的权限
    // （防"用户管理"持有者给傀儡账号赋「全部查看权限」）
    if (permissions !== undefined) {
      validatePermissionsGrant(permissions, req.user!.permissions || []);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) { fields.push(`role = $${idx++}`); values.push(role); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (permissions !== undefined) { fields.push(`permissions = $${idx++}`); values.push(permissions); }

    if (fields.length === 0) throw new AppError(400, '没有要更新的字段');

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
      values
    );

    logAudit(req, '变更角色', 'user', `用户 ${userRow.display_name || userRow.email} 角色/权限已更新`);

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/** DELETE /api/users/:id - 删除用户 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    if (sameUserId(currentUser.userId, id)) {
      throw new AppError(400, '不能删除自己的账号');
    }

    // 越级保护：非 admin 不得删除同级/更高角色账号（防删 admin·director 造成系统无人可管）
    const targetRow = (await query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
    if (!targetRow) throw new AppError(404, '用户不存在');
    assertCanManage(currentUser.role, ROLE_RANK[targetRow.role] ?? 0);
    // 先删 timerecording.profiles（引用 users.id），再删 users，同一事务避免孤儿/外键冲突
    // ① timerecording schema 可能未部署，用 to_regclass 探测，避免 .catch 吞错导致事务 abort；
    // ② 先清空以该用户为 reviewer/created_by 的引用（无 ON DELETE 动作），否则 FK 阻塞删除
    // 事务样板收敛为 withTransaction
    const deleted = await withTransaction(async (client) => {
      const sc = (await client.query(
        `SELECT to_regclass('timerecording.profiles') AS p,
                to_regclass('timerecording.time_records') AS tr,
                to_regclass('timerecording.task_assignments') AS ta`
      )).rows[0];
      // 先锁住该用户的档案与工时行，再做可删性复查：检查与删除之间若有人审为 approved，
      // 级联删除会静默清掉已审核工时（原检查在事务外，挡不住这段竞态）
      if (sc?.p) await client.query('SELECT id FROM timerecording.profiles WHERE id = $1 FOR UPDATE', [id]);
      if (sc?.tr) await client.query('SELECT id FROM timerecording.time_records WHERE user_id = $1 FOR UPDATE', [id]);
      await assertUserDeletable(id);
      if (sc?.p) {
        const hasProfile = (await client.query('SELECT id FROM timerecording.profiles WHERE id = $1', [id])).rows.length > 0;
        if (hasProfile) {
          if (sc.tr) await client.query('UPDATE timerecording.time_records SET reviewed_by = NULL WHERE reviewed_by = $1', [id]);
          // created_by 为 NOT NULL：须先执行生产库 ALTER COLUMN ... DROP NOT NULL，
          // 否则该 UPDATE 命中 23502 令整个删号事务回滚（曾给他人派过任务的管理员将删不掉）
          if (sc.ta) await client.query('UPDATE timerecording.task_assignments SET created_by = NULL WHERE created_by = $1', [id]);
          await client.query('DELETE FROM timerecording.profiles WHERE id = $1', [id]);
        }
      }
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
      if (result.rows.length === 0) throw new AppError(404, '用户不存在');
      return result.rows[0];
    });

    logAudit(req, '删除用户', 'user', `删除用户 ${deleted.email}`);

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

export default router;
