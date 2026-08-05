import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

// 项目主表路由
const projectsFields = [
  'id', 'sales_no', 'client_name', 'client_code', 'project_scope',
  'project_stage', 'expected_award_date', 'project_layout', 'delivery_period', 'project_name',
  'payment_terms', 'postfix', 'note', 'created_at', 'updated_at',
];

const router = crudRoutes('projects', projectsFields, {
  searchFields: ['sales_no', 'client_name'],
  orderBy: 'updated_at DESC',
  // ⚠️ F4 修复：项目存在报价摘要时删除会撞 NO ACTION 外键，明确提示而非通用 400
  beforeDelete: async (id) => {
    const quote = (await query('SELECT id FROM quotations WHERE project_id = $1 LIMIT 1', [id])).rows[0];
    if (quote) throw new AppError(409, '该项目存在报价记录，无法删除。请先删除关联报价。');
  },
  extra: (r) => {
    // 获取项目完整信息（含版本、组、明细）
    r.get('/:id/full', async (req, res, next) => {
      try {
        const { id } = req.params;

        const project = (await query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
        if (!project) throw new AppError(404, '项目未找到');

        const versions = (await query('SELECT * FROM project_versions WHERE project_id = $1 ORDER BY created_at DESC', [id])).rows;

        // 如传入了 version_id 则按版本过滤组
        const versionFilter = req.query.version_id
          ? ' AND version_id = $2' : '';
        const groups = versionFilter
          ? (await query(
              `SELECT * FROM project_groups WHERE project_id = $1${versionFilter} ORDER BY group_no`,
              [id, req.query.version_id]
            )).rows
          : (await query(
              'SELECT * FROM project_groups WHERE project_id = $1 ORDER BY group_no',
              [id]
            )).rows;

        if (groups.length > 0) {
          const groupIds = groups.map(g => g.id);
          const items = (await query(
            `SELECT * FROM group_items WHERE group_id = ANY($1::uuid[]) ORDER BY item_no`,
            [groupIds]
          )).rows;

          const itemsByGroup: Record<string, unknown[]> = {};
          for (const item of items) {
            if (!itemsByGroup[item.group_id]) itemsByGroup[item.group_id] = [];
            itemsByGroup[item.group_id].push(item);
          }
          for (const group of groups) {
            group.items = itemsByGroup[group.id] || [];
          }
        }

        // ⚠️ 前端 Project 类型依赖 currentVersion，删除会导致报价编制表/转机会审批金额为 0
        res.json({ ...project, versions, groups, current_version: versions[0] || null });
      } catch (err) { next(err); }
    });

    // 更新项目版本的审核状态（前端审批级联时使用）
    r.put('/:id/versions/:versionNo/status', async (req, res, next) => {
      try {
        const { id, versionNo } = req.params;
        const { review_status, reviewStatus } = req.body;
        const status = review_status || reviewStatus;
        if (!status) throw new AppError(400, '缺少必填字段：review_status');
        const result = await query(
          `UPDATE project_versions SET review_status = $1, updated_at = now()
           WHERE project_id = $2 AND version_no = $3 RETURNING *`,
          [status, id, versionNo]
        );
        if (result.rows.length === 0) throw new AppError(404, '版本未找到');
        res.json(result.rows[0]);
      } catch (err) { next(err); }
    });
  },
});

export default router;
