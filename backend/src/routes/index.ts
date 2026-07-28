import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import auth from './auth.js';
import users from './users.js';
import components from './components.js';
import projects from './projects.js';
import opportunities from './opportunities.js';
import quotations from './quotations.js';
import approvals from './approvals.js';
import deliveries from './deliveries.js';
import clients from './clients.js';
import tags from './tags.js';
import auditLogs from './auditLogs.js';
import timerecording from './timerecording.js';
import settings from './settings.js';
import { query, getClient } from '../db/index.js';
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/index.js';
import { logAudit, objKeysToSnake } from './helpers.js';

const router = Router();

// 认证路由（无需登录）
router.use('/auth', auth);

// 用户管理（内部含角色校验）
router.use('/users', users);

// 工时系统（自身含登录+鉴权）
router.use('/timerecording', timerecording);

// 业务路由（需要登录）
router.use('/components', requireAuth, components);
router.use('/projects', requireAuth, projects);
router.use('/opportunities', requireAuth, opportunities);
router.use('/quotations', requireAuth, quotations);
router.use('/approvals', requireAuth, approvals);
router.use('/deliveries', requireAuth, deliveries);
router.use('/clients', requireAuth, clients);
router.use('/tags', requireAuth, tags);
router.use('/audit-logs', requireAuth, requireRole('director', 'admin'), auditLogs);

// 用户设置
router.use('/settings', settings);

// ── 项目版本保存 ──
router.post('/project-versions', requireAuth, async (req, res, next) => {
  try {
    const snakeBody = objKeysToSnake(req.body);
    const { project_id, version_no, eur_rate = 8.15, tax_rate = 0.13,
      rounding_digits = 0, warranty_rate = 0.01, risk_rate = 0.03,
      commercial_cost = 0, total_direct_cost = 0, total_accounting_price = 0,
      discounted_price = 0, discount_rate = 0,
      gp3_profit_rate = 0, gp3_amount = 0, review_status = 'draft',
      total_cost = 0, warranty_cost = 0, risk_cost = 0,
      material_cost = 0, labor_cost = 0, project_expense = 0 } = snakeBody;

    if (!project_id || !version_no) {
      throw new AppError(400, 'Missing required fields: project_id, version_no');
    }

    const result = await query(
      `INSERT INTO project_versions (project_id, version_no, eur_rate, tax_rate,
        rounding_digits, warranty_rate, risk_rate, commercial_cost,
        total_direct_cost, total_accounting_price, discounted_price, discount_rate,
        gp3_profit_rate, gp3_amount, review_status,
        total_cost, warranty_cost, risk_cost, material_cost, labor_cost, project_expense)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (project_id, version_no) DO UPDATE SET
        eur_rate = EXCLUDED.eur_rate,
        tax_rate = EXCLUDED.tax_rate,
        rounding_digits = EXCLUDED.rounding_digits,
        warranty_rate = EXCLUDED.warranty_rate,
        risk_rate = EXCLUDED.risk_rate,
        commercial_cost = EXCLUDED.commercial_cost,
        total_direct_cost = EXCLUDED.total_direct_cost,
        total_accounting_price = EXCLUDED.total_accounting_price,
        discounted_price = EXCLUDED.discounted_price,
        discount_rate = EXCLUDED.discount_rate,
        gp3_profit_rate = EXCLUDED.gp3_profit_rate,
        gp3_amount = EXCLUDED.gp3_amount,
        review_status = EXCLUDED.review_status,
        total_cost = EXCLUDED.total_cost,
        warranty_cost = EXCLUDED.warranty_cost,
        risk_cost = EXCLUDED.risk_cost,
        material_cost = EXCLUDED.material_cost,
        labor_cost = EXCLUDED.labor_cost,
        project_expense = EXCLUDED.project_expense,
        updated_at = now()
       RETURNING *`,
      [project_id, version_no, eur_rate, tax_rate, rounding_digits,
       warranty_rate, risk_rate, commercial_cost, total_direct_cost,
       total_accounting_price, discounted_price, discount_rate,
       gp3_profit_rate, gp3_amount, review_status,
       total_cost, warranty_cost, risk_cost, material_cost, labor_cost, project_expense]
    );

    logAudit(req, '版本迭代', 'project', `项目版本 ${version_no} 已保存`);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── 项目组和明细保存（事务保护） ──
router.post('/project-groups', requireAuth, async (req, res, next) => {
  let client: PoolClient | undefined;
  try {
    client = await getClient();
    const body = objKeysToSnake(req.body);
  const { project_id, version_id, group_no, group_type, name,
      is_fixed = false, items = [] } = body;

    if (!project_id || !version_id || group_no === undefined || !group_type || !name) {
      throw new AppError(400, '缺少必填字段：project_id、version_id、group_no、group_type、name');
    }

    await client.query('BEGIN');

    const groupId = req.body.id || undefined;
    const existing = groupId
      ? (await client.query('SELECT id FROM project_groups WHERE id = $1', [groupId])).rows[0]
      : null;

    let groupResult;
    if (existing) {
      // 检查版本号：版本不同则 INSERT 新记录（版本隔离），同版本则 UPDATE
      const currentVerId = (await client.query('SELECT version_id FROM project_groups WHERE id = $1', [groupId])).rows[0]?.version_id;
      if (currentVerId && currentVerId !== version_id) {
        // 版本迭代，创建新组
        groupResult = (await client.query(
          `INSERT INTO project_groups (project_id, version_id, group_no, group_type, name, is_fixed, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [project_id, version_id, group_no, group_type, name, is_fixed, group_no]
        )).rows[0];
      } else {
        groupResult = (await client.query(
          `UPDATE project_groups SET group_no=$1, group_type=$2, name=$3, is_fixed=$4, updated_at=now()
           WHERE id=$5 RETURNING *`,
          [group_no, group_type, name, is_fixed, groupId]
        )).rows[0];
        await client.query('DELETE FROM group_items WHERE group_id = $1', [groupId]);
      }
    } else {
      groupResult = (await client.query(
        `INSERT INTO project_groups (project_id, version_id, group_no, group_type, name, is_fixed, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [project_id, version_id, group_no, group_type, name, is_fixed, group_no]
      )).rows[0];
    }

    // 插入新明细（items 中每个对象的 key 需转蛇形）
    for (let i = 0; i < items.length; i++) {
      const item = objKeysToSnake(items[i]);
      await client.query(
        `INSERT INTO group_items (group_id, item_no, item_type, component_id, code, description,
          qty_total, unit, sourcing_type, unit_cost, design_hours, assembly_hours,
          design_hour_rate, assembly_hour_rate, direct_cost, margin_rate,
          basic_price, accounting_price, has_warranty, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [groupResult.id, i + 1, item.item_type || 'COMPONENT', item.component_id || null,
         item.code || '', item.description || '', item.qty_total || 1, item.unit || '个',
         item.sourcing_type || 'SELF_MANUFACTURED', item.unit_cost || 0,
         item.design_hours || 0, item.assembly_hours || 0,
         item.design_hour_rate || 0, item.assembly_hour_rate || 0,
         item.direct_cost || 0, item.margin_rate || 0,
         item.basic_price || 0, item.accounting_price || 0,
         item.has_warranty || false, item.note || '']
      );
    }

    await client.query('COMMIT');

    // 返回完整组（含明细）
    const savedGroup = (await query('SELECT * FROM project_groups WHERE id = $1', [groupResult.id])).rows[0];
    const savedItems = (await query(
      'SELECT * FROM group_items WHERE group_id = $1 ORDER BY item_no', [groupResult.id]
    )).rows;
    savedGroup.items = savedItems;

    res.status(201).json(savedGroup);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client!.release();
  }
});

// 删除指定版本的所有组和明细（必须在 /:id 之前注册，否则 by-version 被 :id 捕获）
router.delete('/project-groups/by-version/:versionId', requireAuth, async (req, res, next) => {
  try {
    const { versionId } = req.params;
    // group_items 通过外键 ON DELETE CASCADE 自动删除
    await query('DELETE FROM project_groups WHERE version_id = $1', [versionId]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// 删除单个项目组
router.delete('/project-groups/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM project_groups WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
