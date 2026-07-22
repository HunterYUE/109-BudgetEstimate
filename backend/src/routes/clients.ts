import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { AppError } from '../middleware/index.js';
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
    r.get('/:id/detail', async (req, res, next) => {
      try {
        const { id } = req.params;
        const client = (await query('SELECT * FROM clients WHERE id = $1', [id])).rows[0];
        if (!client) throw new AppError(404, 'Client not found');

        const contacts = (await query(
          'SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY name',
          [id]
        )).rows;

        const history = (await query(
          'SELECT * FROM client_history WHERE client_id = $1 ORDER BY date DESC',
          [id]
        )).rows;

        res.json({ ...client, contacts, history });
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

        await tx.query('BEGIN');

        // 更新客户主表字段
        const updateCols = fields.filter(f => f !== 'id' && f !== 'created_at' && f !== 'updated_at' && clientData[f] !== undefined);
        let updated;
        if (updateCols.length > 0) {
          const setClause = updateCols.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
          const values = updateCols.map(f => clientData[f]);
          values.push(id);
          updated = (await tx.query(
            `UPDATE clients SET ${setClause}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
            values
          )).rows[0];
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
        await tx.query('ROLLBACK').catch(() => {});
        next(err);
      } finally {
        tx!.release();
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
        if (!name) throw new AppError(400, 'Contact name is required');

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
          throw new AppError(400, 'project_name and sales_no are required');
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
