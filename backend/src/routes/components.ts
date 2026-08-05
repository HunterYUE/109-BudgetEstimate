import { Router } from 'express';
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
});
