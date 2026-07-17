import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { crudRoutes, objKeysToSnake } from './helpers.js';

const fields = [
  'id', 'opportunity_id', 'sales_no', 'client_name', 'project_name',
  'contract_amount', 'quotation_id', 'status', 'plan_status',
  'plan_approval', 'cost_status', 'cost_approval', 'total_actual_cost',
  'terminated', 'created_at', 'updated_at',
];

const router = crudRoutes('delivery_projects', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name'],
  orderBy: 'updated_at DESC',
  extra: (r) => {
    // 含节点的完整交付项目
    r.get('/:id/full', async (req, res, next) => {
      try {
        const { id } = req.params;
        const dp = (await query('SELECT * FROM delivery_projects WHERE id = $1', [id])).rows[0];
        if (!dp) throw new AppError(404, 'Delivery project not found');

        const nodes = (await query(
          'SELECT * FROM delivery_nodes WHERE delivery_project_id = $1 ORDER BY node_no',
          [id]
        )).rows;

        res.json({ ...dp, nodes });
      } catch (err) { next(err); }
    });

    // 添加/更新节点（事务保护）
    r.put('/:id/nodes', async (req, res, next) => {
      const client = await getClient();
      try {
        const { id } = req.params;
        // ⚠️ 节点字段必须转 snake_case（前端发 camelCase nodeNo → node_no）
        const rawNodes = (req.body.nodes || req.body);
        const nodes = Array.isArray(rawNodes) ? rawNodes.map((n: any) => objKeysToSnake(n)) : rawNodes;
        if (!Array.isArray(nodes)) throw new AppError(400, 'nodes must be an array');

        const dp = (await client.query('SELECT id FROM delivery_projects WHERE id = $1', [id])).rows[0];
        if (!dp) throw new AppError(404, 'Delivery project not found');

        // 备份基线（基线日期一旦审批通过写入，永不被覆盖）
        const existingBaselines = (await client.query(
          "SELECT node_no, baseline_planned_end_date FROM delivery_nodes WHERE delivery_project_id = $1 AND baseline_planned_end_date IS NOT NULL",
          [id]
        )).rows;
        const baselineMap: Record<string, string> = {};
        for (const row of existingBaselines) {
          if (row.baseline_planned_end_date) {
            baselineMap[row.node_no] = row.baseline_planned_end_date;
          }
        }

        await client.query('BEGIN');
        // Replace all nodes: delete old, insert new
        await client.query('DELETE FROM delivery_nodes WHERE delivery_project_id = $1', [id]);
        for (const node of nodes) {
          const baseline = node.baseline_planned_end_date || baselineMap[node.node_no] || null;
          await client.query(
            `INSERT INTO delivery_nodes (delivery_project_id, node_no, name,
              planned_start_date, planned_end_date, actual_date,
              actual_start_date, actual_end_date, baseline_planned_end_date, status, comments, history)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [id, node.node_no, node.name, node.planned_start_date || '',
             node.planned_end_date || '', node.actual_date || null,
             node.actual_start_date || null, node.actual_end_date || null,
             baseline,
             node.status || 'pending', node.comments || '',
             JSON.stringify(node.history || [])]
          );
        }
        await client.query('COMMIT');

        const newNodes = (await query(
          'SELECT * FROM delivery_nodes WHERE delivery_project_id = $1 ORDER BY node_no',
          [id]
        )).rows;

        res.json(newNodes);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
      } finally {
        client.release();
      }
    });
  },
});

export default router;
