-- 014-fix-history-continuity.sql
-- 提升历史数据合理性与延续性（FY2425/FY2526/FY2627）
-- 1. 冻结 18 个月无结果的 A2024-11-005(检测线) 在 FY2425 末终止（放弃），提供"终止"样本
-- 2. 补齐 4 条输单原因（竞对/取消/放弃分析图数据完整）
-- 3. 竞对输单阶段由"线索"推进为"投标"（阶段与原因一致：竞对输单必然经历投标）

-- 1. 冻结项目终止：A2024-11-005 检测线 → 输（FY2425 内放弃，因风险过高）
-- ⚠️ lost_at 须早于 FY 结束日(6/30 00:00)，否则会落入两财年之间的空隙而两边都不计数
UPDATE sales_opportunities
SET status = '输',
    lost_at = '2025-06-25 18:00:00+08',
    stage = '投标',
    reasons = '放弃:风险过高'
WHERE sales_no = 'A2024-11-005-S';

-- 2. 补齐输单原因（与 REASON_TAXONOMY 一致）
UPDATE sales_opportunities SET reasons = '竞对:价格:主机价格'        WHERE sales_no = 'A2024-08-003-S' AND status='输';  -- 智能仓储 议价阶段 输在价格
UPDATE sales_opportunities SET reasons = '取消:需求变更'             WHERE sales_no = 'A2025-07-009-S' AND status='输';  -- 视觉检测 机会阶段 需求变更取消
UPDATE sales_opportunities SET reasons = '竞对:技术方案:主机性能'    WHERE sales_no = 'A2026-01-010-S' AND status='输';  -- AGV物流 投标阶段 技术输单
UPDATE sales_opportunities SET reasons = '取消:预算缩减'             WHERE sales_no = 'A2026-07-014-S' AND status='输';  -- 环保设备 线索阶段 预算缩减取消

-- 3. 竞对输单阶段一致性：线索 → 投标（竞对输单必然经历了投标环节）
UPDATE sales_opportunities SET stage = '投标'
WHERE sales_no IN ('A2026-07-008-S','A2026-07-004-S') AND status='输';
