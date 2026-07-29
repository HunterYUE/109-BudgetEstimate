-- 008-seed-2607009e-test-data.sql
-- 为虚拟项目 2607009E（A2026-07-009-S-E）填充合理的成本对比测试数据
-- 使交付分析页面三个卡片（利润分析/成本偏差率/健康矩阵）数据一致且合理
--
-- 使用方式：通过 psql 或数据库管理工具连接到远程数据库后执行
--   psql -h <host> -p <port> -U budget_app -d budget_estimate -f 008-seed-2607009e-test-data.sql

-- ============================================================
-- 1. 查找 2607009E 交付项目，填充实际成本数据
-- ============================================================
DO $$
DECLARE
  dp_id UUID;
  dp_sales_no VARCHAR := 'A2026-07-009-S-E';
  dp_contract_amount NUMERIC;
  dp_quotation_id UUID;
  dp_status delivery_status;
  dp_cost_status review_status;
  item_rec RECORD;
  actual_json JSONB := '{}'::jsonb;
  total_actual NUMERIC := 0;
  risk_est NUMERIC := 0;
  comm_est NUMERIC := 0;
  warranty_est NUMERIC := 0;
  warranty_base NUMERIC := 0;
  total_estimated NUMERIC := 0;
BEGIN

  -- 查找项目
  SELECT id, contract_amount, quotation_id, status, cost_status
  INTO dp_id, dp_contract_amount, dp_quotation_id, dp_status, dp_cost_status
  FROM delivery_projects WHERE sales_no = dp_sales_no;

  IF dp_id IS NULL THEN
    RAISE NOTICE '项目 % 不存在，跳过', dp_sales_no;
    RETURN;
  END IF;

  RAISE NOTICE '找到项目: id=%, contract_amount=%, quotation_id=%, status=%, cost_status=%',
    dp_id, dp_contract_amount, dp_quotation_id, dp_status, dp_cost_status;

  -- 如果已通过审批，且用户可能想覆盖数据，提示
  IF dp_cost_status = 'approved' THEN
    RAISE NOTICE '项目成本对比已审批通过(cost_status=approved)，如需覆盖需管理员先解锁';
  END IF;

  -- 如果有 quotation_id，则需要加载对应的 groups/items 来生成实际成本
  IF dp_quotation_id IS NOT NULL THEN
    -- 通过报价找到项目 version 和 groups
    -- 实际成本按"概算成本 + 5%~15%上浮"模拟（模拟真实项目通常会超概）
    FOR item_rec IN
      SELECT gi.id, gi.direct_cost, gi.unit_cost, gi.qty_total,
             gi.design_hours, gi.design_hour_rate, gi.assembly_hours, gi.assembly_hour_rate,
             gi.has_warranty, pg.group_type
      FROM quotations q
      JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
      JOIN project_groups pg ON pg.project_id = q.project_id AND pg.version_id = pv.id
      JOIN group_items gi ON gi.group_id = pg.id
      WHERE q.id = dp_quotation_id
    LOOP
      -- 物料成本：概算 × (1 + 5%)
      IF item_rec.group_type IN ('EQUIPMENT', 'INTEGRATION') THEN
        DECLARE
          mat_cost NUMERIC := COALESCE(item_rec.unit_cost, 0) * COALESCE(item_rec.qty_total, 1);
          act_mat NUMERIC := ROUND(mat_cost * 1.05);  -- 超概 5%
        BEGIN
          actual_json := actual_json || jsonb_build_object(item_rec.id::text, act_mat);
          total_actual := total_actual + act_mat;
          total_estimated := total_estimated + COALESCE(item_rec.direct_cost, 0);
          IF NOT item_rec.has_warranty THEN
            warranty_base := warranty_base + COALESCE(item_rec.direct_cost, 0);
          END IF;
        END;
      ELSIF item_rec.group_type IN ('PACKAGING_TRANSPORT', 'IMPLEMENTATION_EXPENSE', 'OTHER') THEN
        DECLARE
          act_exp NUMERIC := ROUND(COALESCE(item_rec.direct_cost, 0) * 1.08);  -- 超概 8%
        BEGIN
          actual_json := actual_json || jsonb_build_object(item_rec.id::text, act_exp);
          total_actual := total_actual + act_exp;
          total_estimated := total_estimated + COALESCE(item_rec.direct_cost, 0);
        END;
      ELSIF item_rec.group_type = 'PROJECT_DELIVERY' THEN
        DECLARE
          act_del NUMERIC := ROUND(COALESCE(item_rec.direct_cost, 0) * 1.10);  -- 超概 10%
        BEGIN
          actual_json := actual_json || jsonb_build_object(item_rec.id::text, act_del);
          total_actual := total_actual + act_del;
          total_estimated := total_estimated + COALESCE(item_rec.direct_cost, 0);
        END;
      END IF;
    END LOOP;

    -- 人工成本 - 设计会签
    -- 汇总设计工时（不受 group 类型限制）
    DECLARE
      design_est NUMERIC := 0;
      assy_est NUMERIC := 0;
    BEGIN
      SELECT COALESCE(SUM(
        ROUND(COALESCE(gi.design_hours, 0) * COALESCE(gi.design_hour_rate, 175))
      ), 0)
      INTO design_est
      FROM quotations q
      JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
      JOIN project_groups pg ON pg.project_id = q.project_id AND pg.version_id = pv.id
      JOIN group_items gi ON gi.group_id = pg.id
      WHERE q.id = dp_quotation_id
        AND pg.group_type IN ('EQUIPMENT', 'INTEGRATION');

      -- 设计会签实际成本（上浮 5%）
      IF design_est > 0 THEN
        actual_json := actual_json || jsonb_build_object('_sv_design', ROUND(design_est * 1.05));
        total_actual := total_actual + ROUND(design_est * 1.05);
      END IF;

      -- 装配调试
      SELECT COALESCE(SUM(
        ROUND(COALESCE(gi.assembly_hours, 0) * COALESCE(gi.assembly_hour_rate, 85) * COALESCE(gi.qty_total, 1))
      ), 0)
      INTO assy_est
      FROM quotations q
      JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
      JOIN project_groups pg ON pg.project_id = q.project_id AND pg.version_id = pv.id
      JOIN group_items gi ON gi.group_id = pg.id
      WHERE q.id = dp_quotation_id
        AND pg.group_type IN ('EQUIPMENT', 'INTEGRATION');

      IF assy_est > 0 THEN
        actual_json := actual_json || jsonb_build_object('_assy_debug', ROUND(assy_est * 1.05));
        total_actual := total_actual + ROUND(assy_est * 1.05);
      END IF;
    END;

    -- 风险费用（按版本费率估算）
    SELECT ROUND(total_estimated * COALESCE(pv.risk_rate, 0.03))
    INTO risk_est
    FROM quotations q
    JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
    WHERE q.id = dp_quotation_id;
    IF risk_est > 0 THEN
      actual_json := actual_json || jsonb_build_object('_risk', risk_est);  -- 风险费用按概算不变
      total_actual := total_actual + risk_est;
    END IF;

    -- 商业费用（取版本设置值）
    SELECT COALESCE(pv.commercial_cost, 0)
    INTO comm_est
    FROM quotations q
    JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
    WHERE q.id = dp_quotation_id;
    IF comm_est > 0 THEN
      actual_json := actual_json || jsonb_build_object('_commercial', ROUND(comm_est * 1.0));  -- 不变
      total_actual := total_actual + comm_est;
    END IF;

    -- 质保费用（始终用概算值，不可编辑）
    SELECT ROUND(warranty_base * COALESCE(pv.warranty_rate, 0.01))
    INTO warranty_est
    FROM quotations q
    JOIN project_versions pv ON pv.project_id = q.project_id AND pv.version_no = q.version_no
    WHERE q.id = dp_quotation_id;

    -- 最终的 totalActualCost = 所有逐项实际成本 + 质保费用
    total_actual := total_actual + warranty_est;

  ELSE
    -- 没有 quotation_id，用项目合同金额估算
    RAISE NOTICE '项目无关联报价(quotation_id IS NULL)，按合同金额估算实际成本';
    total_actual := ROUND(dp_contract_amount / 1.13 * 0.85);  -- 假设实际成本占未税收入的 85%
  END IF;

  -- 更新 delivery_projects
  UPDATE delivery_projects
  SET
    total_actual_cost = total_actual,
    actual_costs = actual_json,
    cost_status = 'approved',    -- 设为已审批，使成本偏差率卡显示数据
    updated_at = now()
  WHERE id = dp_id;

  -- 确保节点15已完成（利润分析和气泡图需要已完成项目）
  UPDATE delivery_nodes
  SET status = 'completed',
      actual_date = to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      actual_end_date = to_char(CURRENT_DATE, 'YYYY-MM-DD')
  WHERE delivery_project_id = dp_id
    AND node_no = 15
    AND status != 'completed';

  -- 如果节点15刚设为完成，同时更新项目状态
  UPDATE delivery_projects
  SET status = '已完成',
      updated_at = now()
  WHERE id = dp_id
    AND status != '已完成'
    AND NOT EXISTS (
      SELECT 1 FROM delivery_nodes
      WHERE delivery_project_id = dp_id AND node_no = 15 AND status != 'completed'
    );

  RAISE NOTICE '✅ 项目 % 成本对比数据已更新：totalActualCost=%, 逐项成本项数=%',
    dp_sales_no, total_actual, (SELECT count FROM jsonb_object_keys(actual_json));

END $$;
