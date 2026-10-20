import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { hasPermission } from '../middleware/auth.js';
import { crudRoutes, logAudit, withTransaction } from './helpers.js';

const fields = [
  'id', 'code', 'name_cn', 'category', 'brand', 'model', 'specification',
  'note', 'supplier', 'sourcing_type', 'unit_cost', 'design_hours',
  'assembly_hours', 'has_warranty', 'unit', 'review_status', 'review_action',
  'version', 'tags', 'change_log', 'created_at', 'updated_at',
];

/** 审核工作流动作白名单（与 DB CHECK components_review_action_check 一致） */
export const REVIEW_ACTIONS = ['', 'create', 'update', 'delete'] as const;
/** 审核决策白名单 */
export const REVIEW_DECISIONS = ['approved', 'rejected'] as const;

const router = Router();

/**
 * POST /api/v1/components/:id/review —— 物料审核决策（通过/驳回）
 * 审核权限从「新增物料」写权中拆出，审核动作须「审批管理/全部查看权限」，
 * 防止提交人自行审批删除申请导致物料被永久删除
 * 删除申请通过时在同一事务内校验引用并删除；驳回只清工作流标记，保留业务备注
 */
router.post('/:id/review', async (req, res, next) => {
  try {
    if (!hasPermission(req.user?.permissions, '审批管理', '全部查看权限')) {
      throw new AppError(403, '无物料审核权限');
    }
    const action = req.body?.action;
    if (!(REVIEW_DECISIONS as readonly string[]).includes(action)) {
      throw new AppError(400, '无效审核动作，允许值：approved, rejected');
    }

    const outcome = await withTransaction(async (client) => {
      const row = (await client.query(
        'SELECT id, code, review_status, review_action FROM components WHERE id = $1 FOR UPDATE',
        [req.params.id]
      )).rows[0];
      if (!row) throw new AppError(404, '物料不存在');
      if (row.review_status !== 'pending') throw new AppError(409, '该物料不在待审核状态');

      if (action === 'approved' && row.review_action === 'delete') {
        // 与 beforeDelete 同规则：被报价引用时不可删除
        const ref = (await client.query(
          'SELECT 1 FROM group_items WHERE component_id = $1 OR code = (SELECT code FROM components WHERE id = $1) LIMIT 1',
          [row.id]
        )).rows[0];
        if (ref) throw new AppError(409, '该物料已被报价编制引用，无法删除。请先从报价中移除该编码。');
        await client.query('DELETE FROM components WHERE id = $1', [row.id]);
        return { deleted: true, id: row.id, code: row.code };
      }

      const updated = (await client.query(
        `UPDATE components
         SET review_status = $1, review_action = '', updated_at = now()
         WHERE id = $2 RETURNING *`,
        [action, row.id]
      )).rows[0];
      return { deleted: false, component: updated, code: row.code, decision: action };
    });

    logAudit(
      req,
      outcome.deleted ? '审核通过并删除物料' : (outcome.decision === 'approved' ? '审核通过物料' : '驳回物料'),
      'material',
      `物料 ${outcome.code} ${outcome.deleted ? '已删除' : (outcome.decision === 'approved' ? '审核通过' : '已驳回')}`
    );
    res.json(outcome);
  } catch (err) { next(err); }
});

const crud = crudRoutes('components', fields, {
  searchFields: ['code', 'name_cn', 'brand', 'model'],
  orderBy: 'updated_at DESC',
  // tags 是 TEXT[] 列，空数组需序列化为 '{}'（'[]' 对 PG 数组字面量非法）
  textArrayCols: ['tags'],
  // 创建一律进入待审核——review_status/review_action 由 beforeCreate 强制覆盖
  // （不能放进 excludeOnCreate：排除后 beforeCreate 的赋值也不会入库）
  excludeOnCreate: ['id', 'created_at', 'updated_at'],
  beforeCreate: async (snakeBody) => {
    snakeBody.review_status = 'pending';
    // 新建记录只可能是「新建申请」，忽略客户端动作值
    snakeBody.review_action = 'create';
  },
  // 任何内容修改都重新进入待审核；终态只能经 /:id/review 流转
  beforeUpdate: async (req, _id, snakeBody) => {
    const contentFields = fields.filter(f => !['id', 'created_at', 'updated_at', 'review_status', 'review_action'].includes(f));
    // 审核状态不接受客户端直写：终态走 /:id/review，内容变更时由下方规则统一置回 pending
    // （只拦 approved/rejected 会让 draft/pending 可注入，把待审/已通过物料移出审核流）
    if (snakeBody.review_status !== undefined) delete snakeBody.review_status;
    if (snakeBody.review_action !== undefined
      && !(REVIEW_ACTIONS as readonly string[]).includes(snakeBody.review_action)) {
      throw new AppError(400, '无效审核动作');
    }
    if (contentFields.some(f => snakeBody[f] !== undefined) || snakeBody.review_action !== undefined) {
      // 内容变更或提交删除申请一律进入待审核
      snakeBody.review_status = 'pending';
      if (snakeBody.review_action === undefined) snakeBody.review_action = 'update';
    }
  },
  // 物料被报价引用时禁止删除（按 component_id 或编码匹配，兼容历史未写 component_id 的明细）
  beforeDelete: async (id) => {
    const ref = (await query(
      'SELECT 1 FROM group_items WHERE component_id = $1 OR code = (SELECT code FROM components WHERE id = $1) LIMIT 1',
      [id]
    )).rows[0];
    if (ref) throw new AppError(409, '该物料已被报价编制引用，无法删除。请先从报价中移除该编码。');
  },
});

// 禁止绕过审核流程硬删除；删除只能经 POST /:id/review 通过删除申请
router.delete('/:id', (_req, _res, next) => {
  next(new AppError(409, '请通过审核流程删除物料'));
});

router.use(crud);

export default router;
