-- 006-fix-audit-issues.sql
-- 修复审计发现的所有 schema 问题

-- 1. project_versions 补充 gp3_amount 列
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS gp3_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. delivery_projects 补充 actual_costs（已有则跳过）
ALTER TABLE delivery_projects ADD COLUMN IF NOT EXISTS actual_costs JSONB DEFAULT '{}'::jsonb;

-- 3. client_history 补充 version_no（前端类型需要）
ALTER TABLE client_history ADD COLUMN IF NOT EXISTS version_no VARCHAR(50);

-- 4. 补充缺失的外键索引
CREATE INDEX IF NOT EXISTS idx_quotations_opportunity_id ON quotations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_quotation_id ON sales_opportunities(quotation_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_quotation_id ON approval_requests(quotation_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_opportunity_id ON approval_requests(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_delivery_id ON approval_requests(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_projects_quotation_id ON delivery_projects(quotation_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_group_no ON project_groups(group_no);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_name ON audit_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_group_items_item_no ON group_items(item_no);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_client_name ON sales_opportunities(client_name);

-- 5. 补充 blue_tables 缺少的 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ language 'plpgsql';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_blue_tables_updated_at') THEN
    CREATE TRIGGER update_blue_tables_updated_at BEFORE UPDATE ON blue_tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 6. 补充 sales_opportunities 缺失的 updated_at 触发器（检查是否存在）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sales_opportunities_updated_at') THEN
    CREATE TRIGGER update_sales_opportunities_updated_at BEFORE UPDATE ON sales_opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON COLUMN project_versions.gp3_amount IS 'GP3利润金额';
