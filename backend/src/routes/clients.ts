import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { requirePermission } from '../middleware/auth.js';
import { crudRoutes, objKeysToSnake } from './helpers.js';

const fields = [
  'id', 'code', 'name', 'type', 'parent_id', 'industry', 'region',
  'salesman', 'credit_level', 'grade',
  'created_at', 'updated_at',
];

const router = crudRoutes('clients', fields, {
  searchFields: ['code', 'name', 'salesman'],
  orderBy: 'updated_at DESC',
  extra: (r) => {
    // 含联系人和历史的完整客户信息
    // ⚠️ H1 修复：detail 含 quotation_history（历史报价折后价），读取需客户相关权限（列表基础信息仍开放）
    r.get('/:id/detail', requirePermission('客户管理', '报价编制', '销售机会管理', '全部查看权限'), async (req, res, next) => {
      try {
        const { id } = req.params;
        const client = (await query('SELECT * FROM clients WHERE id = $1', [id])).rows[0];
        if (!client) throw new AppError(404, '客户未找到');

        const contacts = (await query(
          'SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY name',
          [id]
        )).rows;

        const history = (await query(
          'SELECT * FROM client_history WHERE client_id = $1 ORDER BY date DESC',
          [id]
        )).rows;

        // 从销售机会表获取该客户所有项目的最新报价记录
        const quotationHistory = (await query(
          `SELECT DISTINCT ON (so.sales_no) so.sales_no, so.project_name, so.amount, so.status,
            q.id AS quotation_id, q.version_no,
            pv.discounted_price
           FROM sales_opportunities so
           LEFT JOIN quotations q ON q.opportunity_id = so.id
           LEFT JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
           WHERE so.client_name = $1
             AND so.terminated = true
           ORDER BY so.sales_no, q.updated_at DESC`,
          [client.name]
        )).rows;

        res.json({ ...client, contacts, history, quotation_history: quotationHistory });
      } catch (err) { next(err); }
    });

    // 保存客户时同步保存联系人（事务保护）
    r.put('/:id/save', async (req, res, next) => {
      let tx: any;
      try {
        tx = await getClient();
        const { id } = req.params;
        const body = objKeysToSnake(req.body);
        const { contacts, ...clientData } = body;

        // ⚠️ L2 修复：客户不存在返回 404（此前对不存在客户更新 0 行仍返回 200 空壳）
        const clientRow = (await tx.query('SELECT id FROM clients WHERE id = $1', [id])).rows[0];
        if (!clientRow) throw new AppError(404, '客户未找到');

        await tx.query('BEGIN');

        // 更新客户主表字段
        const updateCols = fields.filter(f => f !== 'id' && f !== 'created_at' && f !== 'updated_at' && clientData[f] !== undefined);
        let updated;
        if (updateCols.length > 0) {
          const oldClient = (await tx.query('SELECT name, salesman FROM clients WHERE id = $1', [id])).rows[0];
          const setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
          const values = updateCols.map(f => clientData[f]);
          values.push(id);
          updated = (await tx.query(
            `UPDATE clients SET ${setClause}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
            values
          )).rows[0];
          // 客户销售员变更 → 级联更新该客户所有机会的销售员（机会销售员由客户信息带出）
          if (clientData.salesman !== undefined && clientData.salesman !== oldClient?.salesman) {
            await tx.query(
              'UPDATE sales_opportunities SET salesman = $1 WHERE client_name = $2',
              [clientData.salesman, oldClient?.name]
            );
          }
          // ⚠️ F10 修复：客户改名 → 级联更新去规范化的 client_name（机会/项目/报价/交付），
          //    否则客户详情历史（按 client_name 关联）改名后消失
          if (clientData.name !== undefined && clientData.name !== oldClient?.name) {
            const oldName = oldClient?.name;
            await tx.query('UPDATE sales_opportunities SET client_name = $1 WHERE client_name = $2', [clientData.name, oldName]);
            await tx.query('UPDATE projects SET client_name = $1 WHERE client_name = $2', [clientData.name, oldName]);
            await tx.query('UPDATE quotations SET client_name = $1 WHERE client_name = $2', [clientData.name, oldName]);
            await tx.query('UPDATE delivery_projects SET client_name = $1 WHERE client_name = $2', [clientData.name, oldName]);
          }
        }

        // 替换联系人
        if (Array.isArray(contacts)) {
          await tx.query('DELETE FROM client_contacts WHERE client_id = $1', [id]);
          for (const c of contacts) {
            const contact = objKeysToSnake(c);
            await tx.query(
              `INSERT INTO client_contacts (client_id, name, position, phone, email, decision_role, superior)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [id, contact.name || '', contact.position || '', contact.phone || '',
               contact.email || '', contact.decision_role || '使用', contact.superior || '']
            );
          }
        }

        await tx.query('COMMIT');

        // 返回完整客户（含联系人）
        if (!updated) updated = (await query('SELECT * FROM clients WHERE id = $1', [id])).rows[0];
        const savedContacts = (await query(
          'SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY name', [id]
        )).rows;
        res.json({ ...updated, contacts: savedContacts });
      } catch (err) {
        // ⚠️ N1 修复：getClient() 失败时 tx 为 undefined，须判空（与 deliveries F8 同款）
        if (tx) await tx.query('ROLLBACK').catch(() => {});
        next(err);
      } finally {
        if (tx) tx.release();
      }
    });

    // 获取所有客户联系人数量（双段路径避免与 /:id 冲突）
    r.get('/stats/contacts', async (_req, res, next) => {
      try {
        const rows = (await query(
          'SELECT client_id, COUNT(*)::int AS cnt FROM client_contacts GROUP BY client_id'
        )).rows;
        const map: Record<string, number> = {};
        for (const r of rows) map[r.client_id] = r.cnt;
        res.json(map);
      } catch (err) { next(err); }
    });

    // 添加联系人
    r.post('/:id/contacts', async (req, res, next) => {
      try {
        const { id } = req.params;
        const body = objKeysToSnake(req.body);
        const { name, position, phone, email, decision_role, superior } = body;
        if (!name) throw new AppError(400, '联系人姓名必填');

        const contact = (await query(
          `INSERT INTO client_contacts (client_id, name, position, phone, email, decision_role, superior)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [id, name, position || '', phone || '', email || '', decision_role || '使用', superior || '']
        )).rows[0];

        res.status(201).json(contact);
      } catch (err) { next(err); }
    });

    // 添加历史记录
    r.post('/:id/history', async (req, res, next) => {
      try {
        const { id } = req.params;
        const body = objKeysToSnake(req.body);
        const { project_name, sales_no, amount, status, date } = body;
        if (!project_name || !sales_no) {
          throw new AppError(400, '项目名称和销售编号必填');
        }

        const record = (await query(
          `INSERT INTO client_history (client_id, project_name, sales_no, amount, status, date)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [id, project_name, sales_no, amount || 0, status || '', date || '']
        )).rows[0];

        res.status(201).json(record);
      } catch (err) { next(err); }
    });
  },
});

export default router;
