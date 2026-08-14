import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { PAGE_LIMIT, DEFAULT_PAGE_SIZE, PASSWORD_MIN } from '../constants.js';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ── 成功响应格式约定（A21）──
// 变更接口返回两类形状，语义明确、勿混用：
//   ① 创建/更新返回受影响实体（前端需用其字段，如创建用户/报价后回填）——返回裸实体；
//   ② 纯动作（删除/重置密码/登出）返回动作信封——删除 `{ deleted: true }`、重置密码 `{ success: true }`、登出 `{ ok: true }`。
// 前端 api.ts 仅依赖 HTTP 状态码（res.ok），不解析信封字段，两类形状互不冲突。

// ── 数值精度纪律 ──
// ⚠️ NUMERIC 经 pg 解析为 float64：聚合/比较边界必须 round，否则 4.1+3.9=8.000000000000002 之类误差
//   会污染通知文本、误判边界比较。规则：金额/工时聚合后一律 round2 再展示或比较；相等比较勿用裸浮点。

/** 保留 2 位小数（工时/金额展示与边界比较统一口径；对齐 DB NUMERIC 存储精度） */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── 审计日志 ──

export async function logAudit(req: Request, action: string, module: string, detail: string = '') {
  const user = req.user;
  const userName = user?.email || 'anonymous';
  try {
    await query(
      `INSERT INTO audit_logs (time, user_name, action, module, detail)
       VALUES (now(), $1, $2, $3, $4)`,
      [userName, action, module, detail]
    );
  } catch (err) {
    console.error('[Audit] 写入审计日志失败:', (err as Error).message);
  }
}

// ── 驼峰 ↔ 蛇形命名转换 ──

/** 单键驼峰 → 蛇形（objKeysToSnake 内部；导出供单测直测） */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
}

/** 转换对象的所有键（驼峰 → 蛇形） */
export function objKeysToSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[camelToSnake(key)] = obj[key];
  }
  return result;
}

// ── 共享工具（A14-A18：分页/事务/搜索/邮箱/密码重置 全后端唯一来源）──

/** 解析分页参数（limit 钳制 [1, PAGE_LIMIT]，offset ≥ 0）。取代各列表各自手写的 parseInt 样板。
 *  defaultLimit：未传 limit 时的默认值（默认 DEFAULT_PAGE_SIZE=100；工时列表等「全量读取」端点
 *  传 PAGE_LIMIT=1000 保持原口径——前端聚合调用亦显式传 limit，防数据量上涨后静默截断） */
export function parsePagination(query: Record<string, any>, defaultLimit: number = DEFAULT_PAGE_SIZE): { limit: number; offset: number } {
  const { limit, offset } = query;
  const limitNum = Math.min(PAGE_LIMIT, Math.max(1, parseInt(String(limit), 10) || defaultLimit));
  const offsetNum = Math.max(0, parseInt(String(offset), 10) || 0);
  return { limit: limitNum, offset: offsetNum };
}

/** 事务封装：BEGIN→fn(client)→COMMIT，异常 ROLLBACK，finally release。取代 getClient+BEGIN/COMMIT/ROLLBACK 样板 */
export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** LIKE/ILIKE 通配符转义（%/_/\ → 前缀反斜杠）——auditLogs 搜索与 buildSearchWhere 共用（A10 统一口径） */
export function escapeLikePattern(s: unknown): string {
  return String(s).replace(/[%_\\]/g, '\\$&');
}

/** 构造多字段 ILIKE 搜索 WHERE 子句（含 %/_/\ 转义统一口径，防通配符注入与前后端行为不一）。
 *  params 会被追加搜索参数；tableAlias 传入时给字段加前缀（如 'so'）。返回 ' WHERE ...' 或 '' */
export function buildSearchWhere(search: unknown, fields: string[], params: any[], tableAlias?: string): string {
  if (search === undefined || search === null || search === '') return '';
  const escaped = escapeLikePattern(search);
  const prefix = tableAlias ? tableAlias + '.' : '';
  // ⚠️ 2026-08-13 修复：逐字段递增参数索引（此前所有字段共用 $1，第 2..N 个参数是死参数——
  //   行为恰好正确因搜索值相同，但索引契约错误、潜在隐患）。map 内先 push 再取 params.length 为当前字段下标。
  const conditions = fields.map(f => {
    params.push(`%${escaped}%`);
    return `${prefix}"${f}"::text ILIKE $${params.length}`;
  });

  return ` WHERE ${conditions.join(' OR ')}`;
}

/** 邮箱归一化：trim + 小写（创建/更新/登录全链路统一，防近似重复账号与大小写漂移） */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 邮箱格式白名单正则（users 创建/更新与 auth 登录共用，防双份漂移） */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── 角色等级与越级保护（A6 复核：users.ts 与 timerecording.ts 管理员路径共用，全后端唯一来源）──

/** 角色等级（数字越大权限越高）——用户/工时管理越级保护依据 */
export const ROLE_RANK: Record<string, number> = { user: 0, manager: 1, director: 2, admin: 3 };

/** 越级保护（H1/A6 提权链核心防线）：操作者只能管理「等级 ≤ 自己」的账号——
 *  纯 ROLE_RANK 等级比较（此前把 director 也算 super，导致 director(2) 能管理 admin(3)，
 *  与 ROLE_RANK 自相矛盾）；防铸 admin 号、把现存更高等级降级/改密/停用/删除 */
export function assertCanManage(actorRole: string, targetRank: number): void {
  const actorRank = ROLE_RANK[actorRole] ?? 0; // 未知角色按最低等级处理（无越级能力）
  if (targetRank > actorRank) {
    throw new AppError(403, '无权创建/修改更高权限的账号');
  }
}

/** 假密码哈希（A5：用户不存在时也执行一次 bcrypt.compare，抹平时耗防批量探测已注册邮箱；
 *  routes/auth.ts 与 timerecording.ts 共用，避免双份同义常量） */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-dummy', 10);

/** 重置用户密码（含长度校验 + password_changed_at 吊销旧 JWT）。调用方自行完成鉴权/越级保护。
 *   users.ts 与 timerecording.ts 管理员重置路径共用 */
export async function resetUserPassword(userId: string, password: string): Promise<void> {
  if (typeof password !== 'string' || !password || password.length < PASSWORD_MIN) {
    throw new AppError(400, `密码至少${PASSWORD_MIN}位`);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // ⚠️ L3：改密同步记录 password_changed_at = now()，使该用户已签发的旧 JWT 立即失效（requireAuth 比对 iat）
  const updated = (await query(
    'UPDATE public.users SET password_hash = $1, password_changed_at = now() WHERE id = $2 RETURNING id',
    [passwordHash, userId]
  )).rows[0];
  if (!updated) throw new AppError(404, '用户不存在');
}

/** 计算 CREATE/UPDATE 可写列：fields 中既不在排除列表、且 body 有值（!== undefined）的列。
 *  A2/A3 契约核心：excludeOnCreate/Update 里的字段（如 status、plan_approval）即便请求体传入也被剥除，
 *  让「创建时直设审批状态」这类绕过状态机的写入在列构造层就被挡掉。 */
export function computeInsertCols(
  fields: string[],
  exclude: string[],
  snakeBody: Record<string, any>,
): string[] {
  return fields.filter(f => !exclude.includes(f) && snakeBody[f] !== undefined);
}

/** JSONB/数组参数序列化：pg 不支持直接传对象数组给 JSONB 列（会把数组当 PG ARRAY），
 *  但 TEXT[] 列需要保留数组原样传给 pg。只 stringify 包含对象的数组。
 *  ⚠️ F9 修复：空数组按列类型区分——TEXT[] 列用 '{}'（PG 空数组字面量），JSONB 列用 '[]'。
 *  textArraySet 为 TEXT[] 列名集合（crudRoutes 从 options.textArrayCols 构造传入；缺省时空数组一律 '[]'） */
export function serializeParams(vals: unknown[], cols?: string[], textArraySet?: Set<string>): unknown[] {
  return vals.map((v, i) => {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) {
      // 空数组：TEXT[] 列用 '{}'，否则 '[]'
      if (v.length === 0) return cols && textArraySet?.has(cols[i]) ? '{}' : '[]';
      // 对象数组或包含非字符串的数组需 JSON.stringify 以匹配 JSONB 列
      if (typeof v[0] === 'object' || typeof v[0] === 'number' || typeof v[0] === 'boolean') return JSON.stringify(v);
    }
    return v;
  });
}

/** 生成标准 CRUD 路由 */
export function crudRoutes(table: string, fields: string[], options?: {
  /** 排序字段 */
  orderBy?: string;
  /** 搜索字段列表 */
  searchFields?: string[];
  /** 创建时排除字段 */
  excludeOnCreate?: string[];
  /** 更新时排除字段 */
  excludeOnUpdate?: string[];
  /** 额外路由 */
  extra?: (router: Router) => void;
  /** 删除前钩子：抛错则阻止删除（用于业务引用检查，如删除含报价/交付的项目） */
  beforeDelete?: (id: string) => Promise<void>;
  /** 创建前钩子：抛错则阻止创建（用于业务不变量校验，如转交付校验机会状态/报价归属） */
  beforeCreate?: (snakeBody: Record<string, any>) => Promise<void>;
  /** 更新前钩子：抛错则阻止更新（用于状态机守卫，如报价审批中禁改财务字段） */
  beforeUpdate?: (id: string, snakeBody: Record<string, any>) => Promise<void>;
  /** 更新后钩子：更新成功且返回行后调用（用于审计留痕等非阻塞后处理，如已审批交付成本被覆盖时记审计）。
   *  收到 req 以便 logAudit；抛错会使本次更新请求返回 500（调用方应内部吞错，参考 logAudit 的 try/catch） */
  afterUpdate?: (req: Request, id: string, snakeBody: Record<string, any>, updatedRow: Record<string, any>) => Promise<void>;
  /** TEXT[] 列名（空数组须序列化为 '{}' 而非 '[]'，后者对 PG 数组字面量非法） */
  textArrayCols?: string[];
  /** 跳过默认 GET / 列表（当顶层已注册自定义列表，避免遮蔽死代码） */
  skipList?: boolean;
  /** 跳过默认 PUT /:id（当顶层已注册自定义更新） */
  skipUpdate?: boolean;
}) {
  const router = Router();
  const {
    orderBy = 'created_at DESC',
    searchFields = [],
    excludeOnCreate = ['id', 'created_at', 'updated_at'],
    excludeOnUpdate = ['id', 'created_at', 'updated_at'],
    textArrayCols = [],
    skipList = false,
    skipUpdate = false,
  } = options || {};
  const textArraySet = new Set(textArrayCols);

  const quotedFields = fields.map(f => `"${f}"`).join(', ');
  // ── 列表（skipList：顶层已注册自定义列表时跳过，防遮蔽死代码）──
  if (!skipList) router.get('/', asyncHandler(async (req, res) => {
    const { search } = req.query;
    let sql = `SELECT ${quotedFields} FROM "${table}"`;
    const params: any[] = [];
    sql += buildSearchWhere(search, searchFields, params);
    const { limit, offset } = parsePagination(req.query);
    sql += ` ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limit, offset]);
    res.json(result.rows);
  }));

  // ── 按 ID 查询 ──
  router.get('/:id', asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT ${quotedFields} FROM "${table}" WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      throw new AppError(404, `记录不存在`);
    }
    res.json(result.rows[0]);
  }));

  // ── 创建 ──
  router.post('/', asyncHandler(async (req, res) => {
    // 自动转换请求体字段名（支持驼峰或蛇形）
    const snakeBody = objKeysToSnake({ ...req.body });
    // ⚠️ A104：创建前业务不变量校验（转交付校验机会状态/报价归属等，抛错则拒绝创建）
    if (options?.beforeCreate) {
      await options.beforeCreate(snakeBody);
    }
    // 过滤掉 undefined 字段（数据库有默认值或可空），只插入有值的列
    const activeCols = computeInsertCols(fields, excludeOnCreate, snakeBody);
    if (activeCols.length === 0) {
      throw new AppError(400, '没有要插入的字段');
    }
    const activePlaceholders = activeCols.map((_, i) => `$${i + 1}`).join(', ');
    const activeNames = activeCols.map(f => `"${f}"`).join(', ');
    const rawValues = activeCols.map(c => snakeBody[c]);
    const result = await query(
      `INSERT INTO "${table}" (${activeNames}) VALUES (${activePlaceholders}) RETURNING ${quotedFields}`,
      serializeParams(rawValues, activeCols, textArraySet)
    );
    res.status(201).json(result.rows[0]);
  }));

  // ── 更新（skipUpdate：顶层已注册自定义更新时跳过，防遮蔽死代码）──
  if (!skipUpdate) router.put('/:id', asyncHandler(async (req, res) => {
    const snakeBody = objKeysToSnake({ ...req.body });
    // ⚠️ A103：更新前状态机守卫（如报价审批中禁改财务字段）
    if (options?.beforeUpdate) {
      await options.beforeUpdate(req.params.id, snakeBody);
    }
    const updateCols = computeInsertCols(fields, excludeOnUpdate, snakeBody);
    if (updateCols.length === 0) {
      throw new AppError(400, '没有要更新的字段');
    }
    const setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const rawValues = updateCols.map(f => snakeBody[f]);
    rawValues.push(req.params.id);
    const result = await query(
      `UPDATE "${table}" SET ${setClause} WHERE id = $${rawValues.length} RETURNING ${quotedFields}`,
      serializeParams(rawValues, updateCols, textArraySet)
    );
    if (result.rows.length === 0) {
      throw new AppError(404, `记录不存在`);
    }
    // ⚠️ 审计修复 #12：更新后钩子（如已审批交付成本被覆盖修改时记审计）——放在响应前、成功后
    if (options?.afterUpdate) {
      await options.afterUpdate(req, req.params.id, snakeBody, result.rows[0]);
    }
    res.json(result.rows[0]);
  }));

  // ── 删除 ──
  router.delete('/:id', asyncHandler(async (req, res) => {
    // ⚠️ F3/F4 修复：删除前业务引用检查（抛错则阻止并给出明确提示，而非撞外键返回通用 400）
    if (options?.beforeDelete) {
      await options.beforeDelete(req.params.id);
    }
    const result = await query(
      `DELETE FROM "${table}" WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      throw new AppError(404, `记录不存在`);
    }
    res.json({ deleted: true, id: req.params.id });
  }));

  // 额外路由
  if (options?.extra) {
    options.extra(router);
  }

  return router;
}
