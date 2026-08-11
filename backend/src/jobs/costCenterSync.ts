import cron from 'node-cron';
import { query } from '../db/index.js';

/**
 * 成本中心码表同步（timerecording.cost_centers）。
 *
 * 规则：
 * - warranty（质保）：预算库 delivery_projects 中「节点15完成」（delivery_nodes node_no=15 AND status='completed'）
 *   的项目，自动以其 sales_no 去 -E 加 -W 生成质保成本中心 —— 工时应用在自己的数据库里创建。
 * - department / personal：每个财年自动补建（A{前缀}-DE-000 / A{前缀}-00-000，不存在则插）。
 * - sales / project 不落码表：由 GET /cost-centers 实时查询预算库（sales_opportunities / delivery_projects）。
 * 全部幂等（INSERT ... ON CONFLICT DO NOTHING），可任意频次重复调用。
 */

const BEIJING = 'Asia/Shanghai';

/** 财年标签（FY2627 式，7/1 起算；中国无夏令时） */
function fiscalYearLabel(d: Date = new Date()): string {
  const m = d.getMonth();
  const y1 = m >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const y2 = m >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(y1 % 100).padStart(2, '0')}${String(y2 % 100).padStart(2, '0')}`;
}

/** 最近 N 个财年（含当前，向前）：['FY2627','FY2526','FY2425'] */
export function recentFiscalYears(n = 3): string[] {
  const y1 = 2000 + parseInt(fiscalYearLabel().slice(2, 4), 10);
  return Array.from({ length: n }, (_, i) => {
    const a = y1 - i, b = a + 1;
    return `FY${String(a % 100).padStart(2, '0')}${String(b % 100).padStart(2, '0')}`;
  });
}

/** 财年步进：FY2526 +1 → FY2627，-1 → FY2425 */
export function fyStep(fy: string, delta: number): string {
  const y1 = 2000 + parseInt(fy.slice(2, 4), 10);
  const a = y1 + delta, b = a + 1;
  return `FY${String(a % 100).padStart(2, '0')}${String(b % 100).padStart(2, '0')}`;
}

/**
 * 当前可用的部门/个人成本中心财年集合（可用窗口 = 财年起点提前一月 ~ 下一财年首月末）：
 * - 恒含当前财年；
 * - 6 月（新财年提前一月）追加下一年 —— 便于提前安排新财年任务；
 * - 7 月（新财年首月）追加上一年 —— 保证老财年工时数据可完整补录。
 */
export function availableCostCenterFys(refDate: Date = new Date()): string[] {
  const cur = fiscalYearLabel(refDate);
  const m = refDate.getMonth(); // 服务器 TZ = Asia/Shanghai
  const set = new Set([cur]);
  if (m === 5) set.add(fyStep(cur, 1));   // 6 月：下一年
  if (m === 6) set.add(fyStep(cur, -1));  // 7 月：上一年
  return Array.from(set);
}

/**
 * 幂等同步成本中心码表。
 * @param fys 需确保存在的部门/个人财年集合（含请求财年，避免跨财年远周为空）
 */
export async function ensureCostCenters(
  fys: string[] = Array.from(new Set([...availableCostCenterFys(), ...recentFiscalYears(3)]))
): Promise<void> {
  // 质保：节点15完成的 -E 交付项目 → -W（每次探测预算库，覆盖新完成项目）
  await query(`
    INSERT INTO timerecording.cost_centers (code, name, type, fy)
    SELECT regexp_replace(dp.sales_no, '-E$', '-W'), dp.project_name, 'warranty', NULL
    FROM delivery_projects dp
    WHERE dp.sales_no LIKE 'A%-E'
      AND EXISTS (
        SELECT 1 FROM delivery_nodes dn
        WHERE dn.delivery_project_id = dp.id
          AND dn.node_no = 15 AND dn.status = 'completed')
    ON CONFLICT (code) DO NOTHING`);

  // 部门/个人：按财年补建
  for (const fy of fys) {
    const prefix = 'A' + fy.slice(2);
    await query(
      `INSERT INTO timerecording.cost_centers (code, name, type, fy)
       VALUES ($1, '部门成本中心', 'department', $3),
              ($2, '个人成本中心', 'personal', $3)
       ON CONFLICT (code) DO NOTHING`,
      [`${prefix}-DE-000`, `${prefix}-00-000`, fy]);
  }
}

/** 服务启动挂载：每小时同步一次（幂等保险，覆盖预算库节点完成的异步性） */
export function startCostCenterSync(): void {
  cron.schedule('0 * * * *', async () => {
    try {
      await ensureCostCenters();
      console.log('[CostCenter] 成本中心码表已同步');
    } catch (err) {
      console.error('[CostCenter] 成本中心同步失败:', err);
    }
  }, { timezone: BEIJING });
  console.log(`[CostCenter] 成本中心码表每小时同步任务已启动（${BEIJING}）`);
}
