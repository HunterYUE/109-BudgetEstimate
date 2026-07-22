import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
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

function camelToSnake(str: string): string {
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
}) {
  const router = Router();
  const {
    orderBy = 'created_at DESC',
    searchFields = [],
    excludeOnCreate = ['id', 'created_at', 'updated_at'],
    excludeOnUpdate = ['id', 'created_at', 'updated_at'],
  } = options || {};

  const quotedFields = fields.map(f => `"${f}"`).join(', ');
  const quotedCols = fields.filter(f => !excludeOnCreate.includes(f));

  // LIST
  router.get('/', asyncHandler(async (req, res) => {
    const { search, limit = '100', offset = '0' } = req.query;
    let sql = `SELECT ${quotedFields} FROM "${table}"`;
    const params: any[] = [];
    if (search && searchFields.length > 0) {
      const conditions = searchFields.map((f, i) => `"${f}"::text ILIKE $${i + 1}`);
      for (let i = 0; i < searchFields.length; i++) params.push(`%${search}%`);
      sql += ` WHERE ${conditions.join(' OR ')}`;
    }
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset as string, 10) || 0);
    sql += ` ORDER BY ${orderBy} LIMIT ${limitNum} OFFSET ${offsetNum}`;
    const result = await query(sql, params);
    res.json(result.rows);
  }));

  // GET BY ID
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

  /** JSONB 参数序列化：pg 不支持直接传对象数组给 JSONB 列（会把数组当 PG ARRAY），
   *  但 TEXT[] 列需要保留数组原样传给 pg。只 stringify 包含对象的数组。 */
  function serializeParams(vals: any[]): any[] {
    return vals.map(v => {
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) {
        // 空数组序列化为 '[]' 避免 pg 库当成 PG ARRAY 处理
        if (v.length === 0) return '[]';
        // 对象数组或包含非字符串的数组需 JSON.stringify 以匹配 JSONB 列
        if (typeof v[0] === 'object' || typeof v[0] === 'number' || typeof v[0] === 'boolean') return JSON.stringify(v);
      }
      return v;
    });
  }

  // CREATE
  router.post('/', asyncHandler(async (req, res) => {
    // 自动转换请求体字段名（支持驼峰或蛇形）
    const snakeBody = objKeysToSnake({ ...req.body });
    // 过滤掉 undefined 字段（数据库有默认值或可空），只插入有值的列
    const activeCols = quotedCols.filter(c => snakeBody[c] !== undefined);
    if (activeCols.length === 0) {
      throw new AppError(400, '没有要插入的字段');
    }
    const activePlaceholders = activeCols.map((_, i) => `$${i + 1}`).join(', ');
    const activeNames = activeCols.map(f => `"${f}"`).join(', ');
    const rawValues = activeCols.map(c => snakeBody[c]);
    const result = await query(
      `INSERT INTO "${table}" (${activeNames}) VALUES (${activePlaceholders}) RETURNING ${quotedFields}`,
      serializeParams(rawValues)
    );
    res.status(201).json(result.rows[0]);
  }));

  // UPDATE
  router.put('/:id', asyncHandler(async (req, res) => {
    const snakeBody = objKeysToSnake({ ...req.body });
    const updateCols = fields.filter(f => !excludeOnUpdate.includes(f) && snakeBody[f] !== undefined);
    if (updateCols.length === 0) {
      throw new AppError(400, '没有要更新的字段');
    }
    const setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const rawValues = updateCols.map(f => snakeBody[f]);
    rawValues.push(req.params.id);
    const result = await query(
      `UPDATE "${table}" SET ${setClause} WHERE id = $${rawValues.length} RETURNING ${quotedFields}`,
      serializeParams(rawValues)
    );
    if (result.rows.length === 0) {
      throw new AppError(404, `记录不存在`);
    }
    res.json(result.rows[0]);
  }));

  // DELETE
  router.delete('/:id', asyncHandler(async (req, res) => {
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
