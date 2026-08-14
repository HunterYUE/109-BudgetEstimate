import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../middleware/index.js';
import { logAudit, objKeysToSnake, normalizeEmail, resetUserPassword, withTransaction, assertCanManage, ROLE_RANK } from './helpers.js';
import { PAGE_LIMIT } from '../constants.js';

const router = Router();

// 所有用户管理接口需要登录 + 用户管理/系统配置权限（与前端 /settings 同口径）
router.use(requireAuth);
router.use(requirePermission('用户管理', '系统配置', '全部查看权限'));

const USER_FIELDS = 'id, email, display_name, title, phone, role, is_active, created_at, permissions';

// ── 用户管理安全常量与越级保护 ──
const VALID_ROLES = ['admin', 'director', 'manager', 'user'];
// ROLE_RANK + assertCanManage 已收敛至 helpers.ts（A6 复核：users.ts 与 timerecording.ts 管理员路径共用，防双份漂移）
/** 服务端权限白名单（与 BudgetEstimateApp/src/pages/SystemManagement.tsx 的 ALL_PERMISSIONS 同源）：
 *  禁止写入白名单外的任意字符串，防"任意赋权/万能权限漂移" */
const ALL_PERMISSIONS = [
  '仪表盘查看', '销售分析', '销售机会管理', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会',
  '销售蓝表编辑', '报价列表查看', '报价编制', '审批管理', '交付管理', '交付分析',
  '成本录入', '物料管理', '新增物料', '新建标签', '客户管理', '新建客户',
  '用户管理', '系统配置', '全部查看权限',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /api/users - 获取用户列表 */
router.get('/', async (_req, res, next) => {
  try {
    // ⚠️ A13 修复：补分页上限（此前无 LIMIT 全表返回；用户量增长后响应体无界）
    const result = await query(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at ASC LIMIT $1`, [PAGE_LIMIT]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

/** POST /api/users - 创建新用户 */
router.post('/', async (req, res, next) => {
  try {
    // 统一转换为 snake_case（兼容前端 api.ts toSnake 或直接调用）
    const { display_name, email, password, title = '', phone = '', role = 'user' } = objKeysToSnake({ ...req.body });
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
    // ⚠️ 越级保护：非 admin/director 不得创建 admin/director 账号（防「用户管理」持有者铸 admin 号）
    assertCanManage(req.user!.role, ROLE_RANK[role] ?? 0);
    // 与重置路径（≥8）统一：创建时也校验弱口令
    if (password.length < 8) {
      throw new AppError(400, '密码至少8位');
    }
    // 邮箱归一化：trim + 小写（防 ' A@x ' 注册近似重复账号；重复检测/存储均用归一化值）
    const emailNorm = normalizeEmail(email);
    if (!EMAIL_RE.test(emailNorm)) {
      throw new AppError(400, '邮箱格式无效');
    }

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [emailNorm]);
    if (existing.rows.length > 0) {
      throw new AppError(409, '该邮箱已被注册');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // ⚠️ L3：password_changed_at = now() 建号即记录改密基准，后续重置据此吊销旧 JWT（requireAuth 比对 iat）
    const result = await query(
      `INSERT INTO users (email, display_name, title, phone, password_hash, role, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING ${USER_FIELDS}`,
      [emailNorm, display_name, title, phone, passwordHash, role]
    );

    logAudit(req, '创建用户', 'user', `创建用户 ${email} (${display_name}) 角色:${role}`);

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
    // ⚠️ 越级保护：只能管理「角色等级 ≤ 自己」的账号（assertCanManage 依 ROLE_RANK 纯等级比较——
    //   同级可管理、仅高等级受拒；此注释与 helpers.ts 行为对齐，勿改回"同级禁止"表述）
    assertCanManage(req.user!.role, ROLE_RANK[existing.rows[0].role] ?? 0);

    // 类型校验（防非法值触发 PG 类型错误 500）
    if (display_name !== undefined && typeof display_name !== 'string') throw new AppError(400, '姓名必须为字符串');
    if (title !== undefined && typeof title !== 'string') throw new AppError(400, '职务必须为字符串');
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

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
      values
    );

    // ⚠️ 审计修复：邮箱变更双写 timerecording.profiles（冗余展示字段，无 FK）——不同步会让工时侧
    //   /auth/me 等返回旧邮箱、数据自相矛盾；timerecording schema 未部署时 to_regclass 探测跳过
    if (emailNorm !== undefined) {
      const sc = (await query(`SELECT to_regclass('timerecording.profiles') AS p`)).rows[0];
      if (sc?.p) await query('UPDATE timerecording.profiles SET email = $1 WHERE id = $2', [emailNorm, id]);
    }

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/** PUT /api/users/:id/password - 重置密码 */
router.put('/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const existing = await query('SELECT role, email, display_name FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, '用户不存在');
    // ⚠️ 越级保护：非 admin 不得重置同级/更高角色账号密码（防改密接管 admin·director）
    assertCanManage(req.user!.role, ROLE_RANK[existing.rows[0].role] ?? 0);

    // ⚠️ A18：密码长度校验/哈希/改密吊销（password_changed_at）共用 resetUserPassword（与工时重置同源）
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

    // ⚠️ 自保护：不能修改自己的角色/权限（防持有"用户管理"权限者自提权为 admin/director）
    if (id === req.user!.userId) throw new AppError(400, '不能修改自己的角色/权限');

    if (role && !VALID_ROLES.includes(role)) {
      throw new AppError(400, `无效角色，允许值：${VALID_ROLES.join(', ')}`);
    }

    const userRow = (await query('SELECT role, email, display_name FROM users WHERE id = $1', [id])).rows[0];
    if (!userRow) throw new AppError(404, '用户不存在');
    // ⚠️ 越级保护：① 目标当前角色 ≥ 操作者 → 不可改（防降级/改权 admin·director）；
    //            ② 新角色等级 ≥ 操作者 → 不可提（防制造同级/更高账号）
    assertCanManage(req.user!.role, ROLE_RANK[userRow.role] ?? 0);
    if (role) assertCanManage(req.user!.role, ROLE_RANK[role] ?? 0);

    // ⚠️ permissions 白名单 + 委托限制：仅允许写白名单内权限，且只能授予操作者自己已持有的权限
    //   （防"用户管理"持有者给傀儡账号赋「全部查看权限」）
    if (permissions !== undefined) {
      if (!Array.isArray(permissions) || !permissions.every(p => typeof p === 'string' && ALL_PERMISSIONS.includes(p))) {
        throw new AppError(400, '权限包含无效值（白名单外或非字符串）');
      }
      const actorPerms = req.user!.permissions || [];
      const denied = permissions.filter(p => !actorPerms.includes(p));
      if (denied.length > 0) {
        throw new AppError(403, `无权授予以下权限：${denied.join('、')}`);
      }
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

    if (currentUser.userId === id) {
      throw new AppError(400, '不能删除自己的账号');
    }

    // ⚠️ 越级保护：非 admin 不得删除同级/更高角色账号（防删 admin·director 造成系统无人可管）
    const targetRow = (await query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
    if (!targetRow) throw new AppError(404, '用户不存在');
    assertCanManage(currentUser.role, ROLE_RANK[targetRow.role] ?? 0);

    // ⚠️ F13 修复：先删 timerecording.profiles（引用 users.id），再删 users，同一事务避免孤儿/外键冲突
    // ⚠️ M5 修复：① timerecording schema 可能未部署，用 to_regclass 探测，避免 .catch 吞错导致事务 abort；
    //            ② 先清空以该用户为 reviewer/created_by 的引用（无 ON DELETE 动作），否则 FK 阻塞删除
    // ⚠️ A15：事务样板收敛为 withTransaction
    const deleted = await withTransaction(async (client) => {
      const sc = (await client.query(
        `SELECT to_regclass('timerecording.profiles') AS p,
                to_regclass('timerecording.time_records') AS tr,
                to_regclass('timerecording.task_assignments') AS ta`
      )).rows[0];
      if (sc?.p) {
        const hasProfile = (await client.query('SELECT id FROM timerecording.profiles WHERE id = $1', [id])).rows.length > 0;
        if (hasProfile) {
          if (sc.tr) await client.query('UPDATE timerecording.time_records SET reviewed_by = NULL WHERE reviewed_by = $1', [id]);
          // ⚠️ created_by 为 NOT NULL：须先执行生产库 ALTER COLUMN ... DROP NOT NULL，
          //   否则该 UPDATE 命中 23502 令整个删号事务回滚（曾给他人派过任务的管理员将删不掉）
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
