-- 017-improve-data-quality.sql
-- 补齐三项数据质量：
-- 1. 3 条"机会+"阶段输单（智能仓储/议价、视觉检测/机会、AGV物流/投标）补齐历史报价编制表
-- 2. client_history 按机会赢/输/冻结结果填充
-- 3. 6 个报价编制表项目（MES/数字化车间/检测线 + 上述3个）补齐组明细

-- ============ 1. 3 条输单补齐报价 ============
INSERT INTO projects (id, sales_no, client_name, project_name, created_at, updated_at) VALUES
  (gen_random_uuid(), 'A2024-08-003-S', '思源中压',   '智能仓储系统', now(), now()),
  (gen_random_uuid(), 'A2025-07-009-S', '思源中压',   '视觉检测系统', now(), now()),
  (gen_random_uuid(), 'A2026-01-010-S', '南通威尔曼', 'AGV物流系统',  now(), now());

INSERT INTO project_versions (
  id, project_id, version_no, eur_rate, tax_rate, rounding_digits,
  warranty_rate, risk_rate, commercial_cost,
  total_direct_cost, total_accounting_price, discounted_price, discount_rate,
  total_cost, warranty_cost, risk_cost,
  gp3_profit_rate, gp3_amount, review_status, created_at, updated_at
)
SELECT gen_random_uuid(), p.id, 'V1.0', 7.8, 0.13, 0, 0.02, 0.02, v.commercial,
  v.direct, v.accounting, v.discounted, 0.05, v.total_cost, v.warranty, v.risk,
  v.gp3, v.gp3_amount, 'approved', now(), now()
FROM projects p
JOIN (
  VALUES
    ('A2024-08-003-S', 707681, 7372, 14743, 7372, 737168, 1031579, 980000, 0.15, 147000),
    ('A2025-07-009-S', 535222, 5575, 11150, 5575, 557522, 789473, 750000, 0.16, 120000),
    ('A2026-01-010-S', 987187, 10283, 20566, 10283, 1028319, 1473684, 1400000, 0.17, 238000)
) AS v(sales_no, direct, warranty, risk, commercial, total_cost, accounting, discounted, gp3, gp3_amount)
  ON v.sales_no = p.sales_no;

INSERT INTO quotations (
  id, project_id, version_no, sales_no, client_name, project_name,
  status, amount, total_cost, profit_rate, opportunity_id, created_at, updated_at
)
SELECT gen_random_uuid(), p.id, pv.version_no, p.sales_no, p.client_name, p.project_name,
  'approved', pv.discounted_price, pv.total_cost, pv.gp3_profit_rate * 100, so.id, now(), now()
FROM projects p
JOIN project_versions pv ON pv.project_id = p.id AND pv.version_no = 'V1.0'
JOIN sales_opportunities so ON so.sales_no = p.sales_no
WHERE p.sales_no IN ('A2024-08-003-S','A2025-07-009-S','A2026-01-010-S');

UPDATE sales_opportunities so SET quotation_id = q.id
FROM quotations q WHERE q.opportunity_id = so.id AND so.quotation_id IS NULL;

-- ============ 2. client_history 填充（按机会赢/输/冻结） ============
INSERT INTO client_history (client_id, project_name, sales_no, amount, status, date, version_no)
SELECT c.id, so.project_name, so.sales_no, so.amount, so.status,
  COALESCE(to_char(so.won_at, 'YYYY-MM-DD'), to_char(so.lost_at, 'YYYY-MM-DD'), to_char(so.updated_at, 'YYYY-MM-DD')),
  q.version_no
FROM sales_opportunities so
JOIN clients c ON c.name = so.client_name
LEFT JOIN quotations q ON q.id = so.quotation_id
WHERE so.status IN ('赢','输','冻结');

-- ============ 3. 6 个报价编制表项目补齐组明细 ============
-- 3.1 组
INSERT INTO project_groups (id, project_id, version_id, group_no, group_type, name, is_fixed, sort_order, created_at, updated_at)
SELECT gen_random_uuid(), p.id, pv.id, g.group_no, g.group_type::group_type, g.name, g.is_fixed, g.sort_order, now(), now()
FROM projects p
JOIN project_versions pv ON pv.project_id = p.id AND pv.version_no = 'V1.0'
JOIN (
  VALUES
    ('A2025-03-004-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2025-03-004-S', 2, 'INTEGRATION', '集成控制', false, 1),
    ('A2026-04-011-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2026-04-011-S', 2, 'INTEGRATION', '集成控制', false, 1),
    ('A2024-11-005-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2024-11-005-S', 2, 'INTEGRATION', '集成控制', false, 1),
    ('A2024-08-003-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2024-08-003-S', 2, 'INTEGRATION', '集成控制', false, 1),
    ('A2025-07-009-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2025-07-009-S', 2, 'INTEGRATION', '集成控制', false, 1),
    ('A2026-01-010-S', 1, 'EQUIPMENT',   '设备组',   false, 0),
    ('A2026-01-010-S', 2, 'INTEGRATION', '集成控制', false, 1)
) AS g(sales_no, group_no, group_type, name, is_fixed, sort_order) ON g.sales_no = p.sales_no;

-- 3.2 明细项（direct_cost 拆分之和 = 版本 total_direct_cost）
INSERT INTO group_items (
  id, group_id, item_no, item_type, code, description, qty_total, unit,
  sourcing_type, unit_cost, design_hours, assembly_hours, design_hour_rate, assembly_hour_rate,
  direct_cost, margin_rate, basic_price, accounting_price, has_warranty, note
)
SELECT gen_random_uuid(), pg.id, 1, it.item_type::item_type, it.code, it.desc_, 1, '套',
  it.sourcing::sourcing_type, it.direct_cost, 0, 0, 0, 0, it.direct_cost, 0.3,
  ROUND(it.direct_cost / 0.7), ROUND(it.direct_cost / 0.7), it.warranty, ''
FROM project_groups pg
JOIN projects p ON p.id = pg.project_id
JOIN (
  VALUES
    ('A2025-03-004-S', 'EQ-MES-000001-V1.0',  '设备组',   'MES系统集成-设备', 595751, 'PURCHASED', true,  'COMPONENT'),
    ('A2025-03-004-S', 'SW-MES-000001-V1.0',  '集成控制', 'MES系统集成-集成', 595752, 'SELF_MANUFACTURED', false, 'SOFTWARE'),
    ('A2026-04-011-S', 'EQ-DIGI-000001-V1.0', '设备组',   '数字化车间-设备',  766300, 'PURCHASED', true,  'COMPONENT'),
    ('A2026-04-011-S', 'SW-DIGI-000001-V1.0', '集成控制', '数字化车间-集成',  766301, 'SELF_MANUFACTURED', false, 'SOFTWARE'),
    ('A2024-11-005-S', 'EQ-LINE-000001-V1.0', '设备组',   '自动化检测线-设备', 784991, 'PURCHASED', true,  'COMPONENT'),
    ('A2024-11-005-S', 'SW-LINE-000001-V1.0', '集成控制', '自动化检测线-集成', 784991, 'SELF_MANUFACTURED', false, 'SOFTWARE'),
    ('A2024-08-003-S', 'EQ-WHS-000001-V1.0',  '设备组',   '智能仓储-设备',    353841, 'PURCHASED', true,  'COMPONENT'),
    ('A2024-08-003-S', 'SW-WHS-000001-V1.0',  '集成控制', '智能仓储-集成',    353840, 'SELF_MANUFACTURED', false, 'SOFTWARE'),
    ('A2025-07-009-S', 'EQ-VIS-000001-V1.0',  '设备组',   '视觉检测-设备',    267611, 'PURCHASED', true,  'COMPONENT'),
    ('A2025-07-009-S', 'SW-VIS-000001-V1.0',  '集成控制', '视觉检测-集成',    267611, 'SELF_MANUFACTURED', false, 'SOFTWARE'),
    ('A2026-01-010-S', 'EQ-AGV-000001-V1.0',  '设备组',   'AGV物流-设备',     493594, 'PURCHASED', true,  'COMPONENT'),
    ('A2026-01-010-S', 'SW-AGV-000001-V1.0',  '集成控制', 'AGV物流-集成',     493593, 'SELF_MANUFACTURED', false, 'SOFTWARE')
) AS it(sales_no, code, group_name, desc_, direct_cost, sourcing, warranty, item_type)
  ON it.sales_no = p.sales_no AND it.group_name = pg.name;
