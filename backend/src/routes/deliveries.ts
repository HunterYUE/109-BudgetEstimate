import { Router, type Request } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { requirePermission } from '../middleware/auth.js';
import multer, { type FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { crudRoutes, objKeysToSnake, buildSearchWhere, parsePagination, withTransaction } from './helpers.js';

const fields = [
  'id', 'opportunity_id', 'sales_no', 'client_name', 'project_name',
  'contract_amount', 'quotation_id', 'status', 'plan_status',
  'plan_approval', 'cost_status', 'cost_approval', 'total_actual_cost',
  'actual_costs',
  'terminated', 'created_at', 'updated_at',
];

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'delivery');
const MAX_SIZE = 3 * 1024 * 1024; // 3MB

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (err: Error | null, dest: string) => void) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: Express.Multer.File, cb: (err: Error | null, name: string) => void) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[/\:]/g, '_');
    cb(null, unique + '-' + safeName);
  },
});

const fileUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, '仅支持 PDF 文件'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// 自定义列表查询：包含节点完成统计（节点总数、已完成数）
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const params: any[] = [];
    let sql = `SELECT dp.*,
        COALESCE(
          (SELECT jsonb_agg(to_jsonb(dn_sub) ORDER BY dn_sub.node_no)
           FROM delivery_nodes dn_sub
           WHERE dn_sub.delivery_project_id = dp.id
          ), '[]'::jsonb
        ) AS nodes
      FROM delivery_projects dp`;
    sql += buildSearchWhere(search, ['sales_no', 'client_name', 'project_name'], params, 'dp');
    // 与 crudRoutes 配置的 orderBy 一致：最近更新优先（原 project_name DESC 为遗留，中文名排序无意义）
    const { limit, offset } = parsePagination(req.query);
    sql += ` ORDER BY dp.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limit, offset]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

const crudRouter = crudRoutes('delivery_projects', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name'],
  orderBy: 'updated_at DESC',
  // ⚠️ A19 修复：顶层已注册自定义列表（含节点聚合），跳过 crudRoutes 中被遮蔽的默认 LIST
  skipList: true,
  // ⚠️ A3/H3 修复：计划/成本审批状态与审批结果 JSONB 只能经审批流程（POST /approvals/:id/records）流转，
  //   创建与更新均禁直设（此前无 excludeOnCreate，POST /deliveries 可直接置 plan_status='approved' 并伪造 plan_approval）。
  //   ⚠️ A3 复核回归修复：quotation_id/opportunity_id 为 UUID NOT NULL 无默认值，必须由转交付流程在前端创建时传入，
  //   故创建不禁直写、更新禁改（转交付后交付与机会/报价的链路归属不可变更）。
  //   注意：显式传会覆盖默认，id/created_at/updated_at 必须一并保留。
  excludeOnCreate: ['id', 'created_at', 'updated_at', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval'],
  excludeOnUpdate: ['id', 'created_at', 'updated_at', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval', 'quotation_id', 'opportunity_id'],
  // ⚠️ A104 修复：转交付创建校验——机会与报价必须真实存在且归属一致（防伪造关联、防把交付挂到他人报价）；
  //   防重复转交付（uq_delivery_opportunity 唯一约束存在，此处给出明确 409 而非撞约束的通用报错）
  beforeCreate: async (snakeBody) => {
    const { opportunity_id, quotation_id } = snakeBody;
    if (!opportunity_id || !quotation_id) throw new AppError(400, '创建交付项目必须提供机会与报价');
    const opp = (await query('SELECT 1 FROM sales_opportunities WHERE id = $1', [opportunity_id])).rows[0];
    if (!opp) throw new AppError(400, '关联的销售机会不存在');
    const quote = (await query('SELECT opportunity_id FROM quotations WHERE id = $1', [quotation_id])).rows[0];
    if (!quote) throw new AppError(400, '关联的报价不存在');
    if (quote.opportunity_id !== opportunity_id) throw new AppError(400, '报价不属于该销售机会，无法转交付');
    const existing = (await query('SELECT 1 FROM delivery_projects WHERE opportunity_id = $1', [opportunity_id])).rows[0];
    if (existing) throw new AppError(409, '该机会已转交付，请勿重复创建交付项目');
  },
  // ⚠️ F15 修复：删除交付项目时清理磁盘上的附件文件（DB 行靠 delivery_files CASCADE 删，物理文件不会随删）
  beforeDelete: async (id) => {
    const files = (await query('SELECT file_path FROM delivery_files WHERE delivery_project_id = $1', [id])).rows as { file_path: string }[];
    for (const f of files) {
      try { if (f.file_path && fs.existsSync(f.file_path)) fs.unlinkSync(f.file_path); } catch { /* 文件可能已移动 */ }
    }
  },
  extra: (r) => {
    // 含节点的完整交付项目
    r.get('/:id/full', async (req, res, next) => {
      try {
        const { id } = req.params;
        const dp = (await query('SELECT * FROM delivery_projects WHERE id = $1', [id])).rows[0];
        if (!dp) throw new AppError(404, '交付项目未找到');

        const nodes = (await query(
          'SELECT * FROM delivery_nodes WHERE delivery_project_id = $1 ORDER BY node_no',
          [id]
        )).rows;

        res.json({ ...dp, nodes });
      } catch (err) { next(err); }
    });

    // 添加/更新节点（事务保护）
    r.put('/:id/nodes', async (req, res, next) => {
      try {
        const { id } = req.params;
        // ⚠️ 节点字段必须转 snake_case（前端发 camelCase nodeNo → node_no）
        const rawNodes = (req.body.nodes || req.body);
        const nodes = Array.isArray(rawNodes) ? rawNodes.map((n: any) => objKeysToSnake(n)) : rawNodes;
        if (!Array.isArray(nodes)) throw new AppError(400, '节点数据必须为数组');

        // ⚠️ A15：事务样板收敛为 withTransaction
        await withTransaction(async (client) => {
          const dp = (await client.query('SELECT id FROM delivery_projects WHERE id = $1', [id])).rows[0];
          if (!dp) throw new AppError(404, '交付项目未找到');

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
        });

        const newNodes = (await query(
          'SELECT * FROM delivery_nodes WHERE delivery_project_id = $1 ORDER BY node_no',
          [id]
        )).rows;

        res.json(newNodes);
      } catch (err) {
        next(err);
      }
    });
  },
});


// ── 交付项目附件路由 ──
router.get('/:deliveryId/files', async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const files = await query(
      'SELECT id, file_type, file_name, file_size, created_at FROM delivery_files WHERE delivery_project_id = $1 ORDER BY created_at',
      [deliveryId]
    );
    res.json(files.rows);
  } catch (err) { next(err); }
});

router.post('/:deliveryId/files', fileUpload.single('file'), async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const { file_type } = req.body;
    const rf = req as any;
    if (!rf.file) throw new AppError(400, '请选择文件');
    if (!file_type) throw new AppError(400, '缺少 file_type');
    // ⚠️ 白名单校验：与前端 ATTACHMENT_TYPES 的 4 类一一对应，防止未知类型写入
    if (!['rfq', 'techPlan', 'techAgreement', 'contract'].includes(file_type)) {
      throw new AppError(400, '未知文件类型');
    }

    const result = await query(
      `INSERT INTO delivery_files (delivery_project_id, file_type, file_name, file_size, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, file_type, file_name, file_size, created_at`,
      [deliveryId, file_type, Buffer.from(rf.file.originalname, 'latin1').toString('utf8'), rf.file.size, rf.file.path]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ⚠️ F19 修复：附件下载需 交付管理 权限（与交付详情页访问权限一致，GET 不被 writeGuard 拦，故单独加权限校验）
router.get('/:deliveryId/files/:fileId/download', requirePermission('交付管理', '全部查看权限'), async (req, res, next) => {
  try {
    const { deliveryId, fileId } = req.params;
    const file = (await query(
      'SELECT * FROM delivery_files WHERE id = $1 AND delivery_project_id = $2',
      [fileId, deliveryId]
    )).rows[0];
    if (!file) throw new AppError(404, '文件未找到');
    if (!fs.existsSync(file.file_path)) throw new AppError(404, '文件已丢失');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    const stream = fs.createReadStream(file.file_path);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.removeHeader('Content-Disposition');
        res.status(500).json({ error: '文件读取失败' });
      }
    });
    stream.pipe(res);
  } catch (err) { next(err); }
});

router.delete('/:deliveryId/files/:fileId', async (req, res, next) => {
  try {
    const { deliveryId, fileId } = req.params;
    const file = (await query(
      'SELECT * FROM delivery_files WHERE id = $1 AND delivery_project_id = $2',
      [fileId, deliveryId]
    )).rows[0];
    if (!file) throw new AppError(404, '文件未找到');

    try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch { /* 物理文件可能已被移动或删除 */ }
    await query('DELETE FROM delivery_files WHERE id = $1', [fileId]);
    res.json({ deleted: true, id: fileId });
  } catch (err) { next(err); }
});


// 挂载标准 CRUD 路由（GET /:id, POST, PUT, DELETE 等）
router.use(crudRouter);

export default router;
