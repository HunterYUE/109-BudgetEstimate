import { Router, type Request } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import { requirePermission, hasPermission } from '../middleware/auth.js';
import multer, { type FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { crudRoutes, objKeysToSnake, buildSearchWhere, parsePagination, withTransaction, logAudit } from './helpers.js';

const fields = [
  'id', 'opportunity_id', 'sales_no', 'client_name', 'project_name',
  'contract_amount', 'quotation_id', 'status', 'plan_status',
  'plan_approval', 'cost_status', 'cost_approval', 'total_actual_cost',
  'actual_costs',
  'terminated', 'created_at', 'updated_at',
];

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'delivery');
const MAX_SIZE = 3 * 1024 * 1024; // 3MB

/** 上传文件名净化：正斜杠、反斜杠、冒号替换为下划线（防路径穿越与非法文件名） */
export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:]/g, '_');
}

/** 交付项目状态枚举（DB enum delivery_status；应用层预校验给 400，避免非法值撞 PG 枚举报 500） */
export const DELIVERY_STATUSES = ['未开始', '进行中', '已完成'] as const;
export function isValidDeliveryStatus(status: unknown): boolean {
  return status === undefined || (DELIVERY_STATUSES as readonly string[]).includes(status as string);
}

/** 节点状态枚举白名单（DB 列 node_status: pending/in_progress/completed；undefined 走下方 'pending' 兜底） */
export const NODE_STATUS_WHITELIST = ['pending', 'in_progress', 'completed'] as const;
export function isValidNodeStatus(status: unknown): boolean {
  return status === undefined || (NODE_STATUS_WHITELIST as readonly string[]).includes(status as string);
}

/** 交付附件类型白名单（与前端 ATTACHMENT_TYPES 的 4 类一一对应，防未知类型写入） */
export const FILE_TYPES = ['rfq', 'techPlan', 'techAgreement', 'contract'] as const;

/** 节点 INSERT 参数归一化（空串兜底/status 默认 pending/comments 空串/history JSON.stringify 防畸形 JSON 入库；
 * baseline 由路由层按「审批基线不可变」规则传入——不含 delivery_project_id，由路由前缀拼接 */
export function normalizeNodeInsertParams(node: Record<string, any>, baseline: string | null): any[] {
  return [
    node.node_no, node.name,
    node.planned_start_date || '', node.planned_end_date || '',
    node.actual_date || null, node.actual_start_date || null, node.actual_end_date || null,
    baseline, node.status || 'pending', node.comments || '',
    JSON.stringify(node.history || []),
  ];
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (err: Error | null, dest: string) => void) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: Express.Multer.File, cb: (err: Error | null, name: string) => void) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + sanitizeFileName(file.originalname));
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
    // 与 crudRoutes 配置的 orderBy 一致：最近更新优先（中文项目名排序无意义）
    const { limit, offset } = parsePagination(req.query);
    sql += ` ORDER BY dp.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await query(sql, [...params, limit, offset]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

const crudRouter = crudRoutes('delivery_projects', fields, {
  searchFields: ['sales_no', 'client_name', 'project_name'],
  orderBy: 'updated_at DESC',
  // 顶层已注册自定义列表（含节点聚合），跳过 crudRoutes 中被遮蔽的默认 LIST
  skipList: true,
  // 计划/成本审批状态与审批结果 JSONB 只能经审批流程（POST /approvals/:id/records）流转，
  // 创建与更新均禁直设
  // quotation_id/opportunity_id 为 UUID NOT NULL 无默认值，必须由转交付流程在前端创建时传入，
  // 故创建不禁直写、更新禁改（转交付后交付与机会/报价的链路归属不可变更）
  // 注意：显式传会覆盖默认，id/created_at/updated_at 必须一并保留
  // 创建禁直写 total_actual_cost/actual_costs/terminated——实际成本只能经成本提交/审批流写入，
  // 转交付终止标记只能经机会 terminated 流流转；防创建时伪造成本/直接标完结。status 保留直写（转交付传'进行中'）
  excludeOnCreate: ['id', 'created_at', 'updated_at', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval', 'total_actual_cost', 'actual_costs', 'terminated'],
  excludeOnUpdate: ['id', 'created_at', 'updated_at', 'plan_status', 'cost_status', 'plan_approval', 'cost_approval', 'quotation_id', 'opportunity_id'],
  // 转交付创建校验——机会与报价必须真实存在且归属一致（防伪造关联、防把交付挂到他人报价）；
  // 防重复转交付（uq_delivery_opportunity 唯一约束存在，此处给出明确 409 而非撞约束的通用报错）
  beforeCreate: async (snakeBody) => {
    const { opportunity_id, quotation_id } = snakeBody;
    if (!opportunity_id || !quotation_id) throw new AppError(400, '创建交付项目必须提供机会与报价');
    if (!isValidDeliveryStatus(snakeBody.status)) {
      throw new AppError(400, `无效交付状态，允许值：${DELIVERY_STATUSES.join('、')}`);
    }
    // 完成门禁只能经「节点全部完成 + 成本审批通过」后由更新路径触发，创建即完成会绕过全部门禁
    if (snakeBody.status === '已完成') throw new AppError(400, '新建交付项目不能直接标记为已完成');
    const opp = (await query('SELECT 1 FROM sales_opportunities WHERE id = $1', [opportunity_id])).rows[0];
    if (!opp) throw new AppError(400, '关联的销售机会不存在');
    const quote = (await query('SELECT opportunity_id FROM quotations WHERE id = $1', [quotation_id])).rows[0];
    if (!quote) throw new AppError(400, '关联的报价不存在');
    if (quote.opportunity_id !== opportunity_id) throw new AppError(400, '报价不属于该销售机会，无法转交付');
    const existing = (await query('SELECT 1 FROM delivery_projects WHERE opportunity_id = $1', [opportunity_id])).rows[0];
    if (existing) throw new AppError(409, '该机会已转交付，请勿重复创建交付项目');
  },
  // 完成门禁/审批中成本锁从「仅前端」下沉到服务端
  // status 不可直接 PUT 为已完成（分析按完成日归集订单/销售），须通过节点与成本审批门禁；
  // cost_status='pending' 时实际成本也可被覆盖，审批快照与落库值分叉
  beforeUpdate: async (req, id, snakeBody) => {
    if (!isValidDeliveryStatus(snakeBody.status)) {
      throw new AppError(400, `无效交付状态，允许值：${DELIVERY_STATUSES.join('、')}`);
    }
    if (snakeBody.status === '已完成') {
      const dp = (await query('SELECT cost_status FROM delivery_projects WHERE id = $1', [id])).rows[0];
      if (!dp) throw new AppError(404, '交付项目未找到');
      if (dp.cost_status !== 'approved') throw new AppError(409, '成本对比审批通过后才能完成项目');
      const nodes = (await query(
        'SELECT node_no, status FROM delivery_nodes WHERE delivery_project_id = $1', [id]
      )).rows as { node_no: number; status: string }[];
      if (nodes.length === 0) throw new AppError(409, '交付项目尚无节点，不能完成');
      const incomplete = nodes.filter(n => n.status !== 'completed').map(n => n.node_no);
      if (incomplete.length > 0) throw new AppError(409, `尚有 ${incomplete.join('、')} 号节点未完成`);
    }
    const touchesCost = snakeBody.total_actual_cost !== undefined || snakeBody.actual_costs !== undefined;
    if (touchesCost) {
      const dp = (await query('SELECT cost_status FROM delivery_projects WHERE id = $1', [id])).rows[0];
      if (dp?.cost_status === 'pending') throw new AppError(409, '成本对比审批中，不可修改实际成本');
      // 已审批成本默认锁定：仅总监/管理员可解锁覆盖（前端只对总监显示解锁入口，后端是权威防线）
      if (dp?.cost_status === 'approved' && req.user?.role !== 'director' && req.user?.role !== 'admin') {
        throw new AppError(403, '成本对比已审批，仅总监可覆盖修改');
      }
    }
  },
  // 已审批交付的成本被覆盖修改须审计留痕（DeliveryDetail 总监解锁覆盖成本场景）——
  // 覆盖成本 = 直接修改已批准的成本对比，是敏感操作；记录操作者与修改后的总实际成本
  // 只补审计、不强制重新审批（用户选定方案：改前不拦、改后留痕）
  afterUpdate: async (req, id, snakeBody, updatedRow) => {
    const costFields = ['total_actual_cost', 'actual_costs'];
    const costChanged = costFields.some(f => snakeBody[f] !== undefined);
    // 仅当成本字段被修改（排除 plan 节点保存走 /:id/nodes 不会经过这里；状态/计划字段不算成本覆盖）
    if (costChanged) {
      logAudit(req, '修改成本', 'delivery',
        `交付 ${updatedRow.sales_no || id.slice(0, 8)} 成本被修改${updatedRow.cost_status === 'approved' ? '（已审批覆盖）' : ''}，总实际成本 ${updatedRow.total_actual_cost ?? 0}`)
        .catch(err => console.warn('[deliveries] 成本修改审计写入失败', (err as Error).message));
    }
  },
  // 存在待审批请求时禁止删除——FK 为 SET NULL，删除后审批失去目标，通过时静默空操作
  beforeDelete: async (id) => {
    const pending = (await query(
      "SELECT 1 FROM approval_requests WHERE delivery_id = $1 AND status = 'pending'", [id]
    )).rows[0];
    if (pending) throw new AppError(409, '该交付存在待审批请求，请先取消审批');
    // 附件行会随交付 CASCADE 删除，路径必须先快照（afterDelete 时已查不到）
    return (await query(
      'SELECT file_path FROM delivery_files WHERE delivery_project_id = $1', [id]
    )).rows.map((f: { file_path: string }) => f.file_path).filter(Boolean) as string[];
  },
  // 删除交付项目时清理磁盘附件——放到 DB 删除成功之后（afterDelete），
  // 避免 DELETE 失败（外键/DB 抖动）时文件已丢失而记录仍在
  afterDelete: async (_id, context) => {
    const paths = Array.isArray(context) ? context as string[] : [];
    for (const filePath of paths) {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* 文件可能已移动 */ }
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
        // 节点字段必须转 snake_case（前端发 camelCase nodeNo → node_no）
        const rawNodes = (req.body.nodes || req.body);
        if (!Array.isArray(rawNodes)) throw new AppError(400, '节点数据必须为数组');
        if (rawNodes.some((n: unknown) => !n || typeof n !== 'object' || Array.isArray(n))) {
          throw new AppError(400, '节点数据包含非法元素');
        }
        const nodes = rawNodes.map((n: any) => objKeysToSnake(n));

        // 节点号是业务主键（节点15/分析/延期判定直接依赖）：归一化为整数并限制 1–15，
        // 防字符串 "15" 绕过节点15门禁、或重复节点号落库
        const seenNodeNos = new Set<number>();
        for (const node of nodes) {
          const nodeNo = Number(node.node_no);
          if (!Number.isInteger(nodeNo) || nodeNo < 1 || nodeNo > 15) {
            throw new AppError(400, `节点号非法：${node.node_no}`);
          }
          node.node_no = nodeNo;
          if (seenNodeNos.has(nodeNo)) throw new AppError(400, `节点号重复：${nodeNo}`);
          seenNodeNos.add(nodeNo);
          // 计划起止顺序（仅校验标准日期串，历史空串/其他格式由前端展示逻辑兜底）
          const ps = String(node.planned_start_date || '');
          const pe = String(node.planned_end_date || '');
          if (/^\d{4}-\d{2}-\d{2}$/.test(ps) && /^\d{4}-\d{2}-\d{2}$/.test(pe) && pe < ps) {
            throw new AppError(400, `节点 ${node.node_no} 计划结束日期早于开始日期`);
          }
        }

        // 事务样板收敛为 withTransaction
        await withTransaction(async (client) => {
          // 行锁：与审批事务串行化，防「检查 plan_status 后、写入前」被审批改状态
          const dp = (await client.query(
            'SELECT id, plan_status, cost_status FROM delivery_projects WHERE id = $1 FOR UPDATE', [id]
          )).rows[0];
          if (!dp) throw new AppError(404, '交付项目未找到');
          // 审批中一律冻结节点（提交后审批对象不得变化）；已审批后仅「交付管理/万能权限」可维护
          if (dp.plan_status === 'pending') {
            throw new AppError(409, '实施计划审批中，不可修改节点');
          }
          if (dp.plan_status === 'approved' && !hasPermission(req.user?.permissions, '交付管理', '全部查看权限')) {
            throw new AppError(403, '该交付计划已审批，节点修改需要交付管理权限');
          }
          // 读取现有节点（行锁）：用于「不得以省略删除节点」、完成门禁与历史合并
          const existingNodes = (await client.query(
            'SELECT node_no, status, history, baseline_planned_end_date FROM delivery_nodes WHERE delivery_project_id = $1 FOR UPDATE',
            [id]
          )).rows as { node_no: number; status: string; history: unknown; baseline_planned_end_date: string | null }[];
          const existingByNo = new Map(existingNodes.map(n => [n.node_no, n]));
          const payloadNos = new Set(nodes.map((n: any) => n.node_no));
          const omitted = existingNodes.map(n => n.node_no).filter(no => !payloadNos.has(no));
          if (omitted.length > 0) {
            throw new AppError(400, `节点保存不能省略已有节点：${omitted.join('、')}`);
          }

          // 节点15完成 = 项目完结信号——必须成本审批通过且其余节点全部完成（与前端 projectCompletionGate 同口径）
          // 仅对「本次新完成」的迁移校验；历史已完成的节点15 不因后续编辑其它节点而被反向卡住
          const n15 = nodes.find((n: any) => n.node_no === 15);
          if (n15 && n15.status === 'completed') {
            const prev15 = existingByNo.get(15);
            if (prev15?.status !== 'completed') {
              if (dp.cost_status !== 'approved') throw new AppError(409, '成本对比审批通过后才能完成节点15');
              const statusByNo = new Map<number, string>(existingNodes.map(n => [n.node_no, n.status]));
              for (const n of nodes) statusByNo.set(n.node_no, n.status);
              const incomplete: number[] = [];
              for (let no = 1; no <= 14; no++) {
                if ((statusByNo.get(no) ?? 'pending') !== 'completed') incomplete.push(no);
              }
              if (incomplete.length > 0) throw new AppError(409, `尚有 ${incomplete.join('、')} 号节点未完成`);
            }
            if (!n15.actual_date && !n15.actual_end_date) {
              throw new AppError(400, '节点15完成必须填写实际完成日期');
            }
          }

          // 基线只由审批流程写入：忽略客户端提交的基线值
          const baselineMap: Record<string, string> = {};
          for (const row of existingNodes) {
            if (row.baseline_planned_end_date) baselineMap[row.node_no] = row.baseline_planned_end_date;
          }

          // 整组替换节点：先删旧后插新
          await client.query('DELETE FROM delivery_nodes WHERE delivery_project_id = $1', [id]);
          for (const node of nodes) {
            // node.status 枚举白名单（DB 列 node_status: pending/in_progress/completed）——
            // 非法值直插触发 PG 枚举错误被 500 吞掉；显式预校验给 400（undefined 走下方 'pending' 兜底）
            if (!isValidNodeStatus(node.status)) {
              throw new AppError(400, `节点 ${node.node_no ?? ''} 状态非法，允许值：pending, in_progress, completed`);
            }
            // history 必须为数组——非数组 JSON.stringify 后落库为畸形 JSON，
            // 渲染时 DeliveryNodeTimeline 的 .find/.map 会崩溃；显式校验防畸形数据入库
            if (node.history !== undefined && !Array.isArray(node.history)) {
              throw new AppError(400, `节点 ${node.node_no ?? ''} history 必须为数组`);
            }
            // 历史只增不减：保留库中既有条目，仅追加新条目；modifier 取当前登录用户，防伪造成他人
            const prevNode = existingByNo.get(node.node_no);
            const prevHistory = Array.isArray(prevNode?.history) ? prevNode.history as any[] : [];
            const prevHistoryIds = new Set(prevHistory.map((h: any) => h?.id).filter(Boolean));
            const incomingHistory = Array.isArray(node.history) ? node.history as any[] : [];
            if (incomingHistory.length + prevHistory.length > 200) {
              throw new AppError(400, `节点 ${node.node_no} 历史记录过多（最多 200 条）`);
            }
            const appended = incomingHistory
              .filter((h: any) => h && typeof h === 'object' && !prevHistoryIds.has(h.id))
              .map((h: any) => ({ ...h, modifier: req.user?.display_name || h.modifier }));
            node.history = [...prevHistory, ...appended];
            // 基线只能由审批流程写入，客户端提交值一律忽略
            const baseline = baselineMap[node.node_no] || null;
            await client.query(
              `INSERT INTO delivery_nodes (delivery_project_id, node_no, name,
                planned_start_date, planned_end_date, actual_date,
                actual_start_date, actual_end_date, baseline_planned_end_date, status, comments, history)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [id, ...normalizeNodeInsertParams(node, baseline)]
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

// 附件上传须「交付管理」——「销售机会管理」仅限转交付创建/初始化节点，不能对任意交付上传附件
router.post('/:deliveryId/files', requirePermission('交付管理', '全部查看权限'), fileUpload.single('file'), async (req, res, next) => {
  const rf = req as any;
  const cleanupUpload = () => {
    try { if (rf.file?.path && fs.existsSync(rf.file.path)) fs.unlinkSync(rf.file.path); } catch { /* 清理失败不影响主错误 */ }
  };
  try {
    const { deliveryId } = req.params;
    const { file_type } = req.body;
    if (!rf.file) throw new AppError(400, '请选择文件');
    if (!file_type) throw new AppError(400, '缺少 file_type');
    // 白名单校验：与前端 ATTACHMENT_TYPES 的 4 类一一对应，防止未知类型写入
    if (!(FILE_TYPES as readonly string[]).includes(file_type)) {
      throw new AppError(400, '未知文件类型');
    }
    // multer 先落盘，业务校验失败必须清理，否则可用非法请求无限堆积文件
    // mimetype 由客户端提供可伪造，再校验 PDF 魔数（%PDF-）兜底
    const head = Buffer.alloc(5);
    const fd = fs.openSync(rf.file.path, 'r');
    try { fs.readSync(fd, head, 0, 5, 0); } finally { fs.closeSync(fd); }
    if (head.toString('latin1') !== '%PDF-') {
      throw new AppError(400, '文件内容不是有效的 PDF');
    }

    const result = await query(
      `INSERT INTO delivery_files (delivery_project_id, file_type, file_name, file_size, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, file_type, file_name, file_size, created_at`,
      [deliveryId, file_type, Buffer.from(rf.file.originalname, 'latin1').toString('utf8'), rf.file.size, rf.file.path]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    cleanupUpload();
    next(err);
  }
});

// 附件下载需交付管理权限（与交付详情页访问权限一致，GET 不被 writeGuard 拦，故单独加权限校验）
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
      } else {
        // 响应头已发出时无法再写错误体，必须主动断开，否则客户端会挂到超时
        res.destroy();
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

    // 先删数据库行，成功后再删物理文件：反序会在 DB 失败时留下指向缺失文件的记录
    const deleted = await query('DELETE FROM delivery_files WHERE id = $1 RETURNING id', [fileId]);
    if (deleted.rows.length === 0) throw new AppError(404, '文件未找到');
    try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch { /* 物理文件可能已被移动或删除 */ }
    res.json({ deleted: true, id: fileId });
  } catch (err) { next(err); }
});


// 挂载标准 CRUD 路由（GET /:id, POST, PUT, DELETE 等）
router.use(crudRouter);

export default router;
