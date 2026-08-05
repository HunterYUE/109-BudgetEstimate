import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes } from './helpers.js';

const fields = [
  'id', 'code', 'name_cn', 'category', 'brand', 'model', 'specification',
  'note', 'supplier', 'sourcing_type', 'unit_cost', 'design_hours',
  'assembly_hours', 'has_warranty', 'unit', 'review_status', 'version',
  'tags', 'change_log', 'created_at', 'updated_at',
];

export default crudRoutes('components', fields, {
  searchFields: ['code', 'name_cn', 'brand', 'model'],
  orderBy: 'updated_at DESC',
  // ⚠️ F9 修复：tags 是 TEXT[] 列，空数组需序列化为 '{}'（'[]' 对 PG 数组字面量非法）
  textArrayCols: ['tags'],
  // ⚠️ 物料被报价引用时禁止删除（group_items.component_id 有 NO ACTION 外键，硬删撞约束给通用 400）
  beforeDelete: async (id) => {
    const ref = (await query('SELECT group_id FROM group_items WHERE component_id = $1 LIMIT 1', [id])).rows[0];
    if (ref) throw new AppError(409, '该物料已被报价编制引用，无法删除。请先从报价中移除该编码。');
  },
});
