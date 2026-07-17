-- ============================================================
-- 109-BudgetEstimate 应用数据库 Schema
-- PostgreSQL 16+
-- 基于 TypeScript 类型定义生成的完整数据库结构
-- ============================================================

-- 0. 创建数据库（需以 superuser 执行）
-- CREATE DATABASE budget_estimate ENCODING 'UTF8' LC_COLLATE 'zh_CN.UTF-8' LC_CTYPE 'zh_CN.UTF-8';

-- ===== 枚举类型 =====
DO $$ BEGIN
  CREATE TYPE sourcing_type AS ENUM ('PURCHASED', 'SELF_MANUFACTURED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE item_type AS ENUM ('COMPLETE_SET', 'COMPONENT', 'PART', 'SOFTWARE', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE group_type AS ENUM ('EQUIPMENT', 'INTEGRATION', 'PACKAGING_TRANSPORT', 'PROJECT_DELIVERY', 'IMPLEMENTATION_EXPENSE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('enterprise', 'subsidiary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE credit_level AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_grade AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_role AS ENUM ('使用', '技术', '商务', '高层');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_stage AS ENUM ('信息', '线索', '机会', '投标', '议价', '中标');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_status AS ENUM ('过程中', '赢', '输', '冻结');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('进行中', '已完成', '已延期');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE node_status AS ENUM ('pending', 'in_progress', 'completed', 'delayed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_type AS ENUM ('quotation', 'plan', 'cost', 'promote');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_action AS ENUM ('approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE veto_budget_option AS ENUM ('ok', 'possible', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE timeline_option AS ENUM ('optimistic', 'neutral', 'negative');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE influence_level AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('EB', 'UB', 'TB', 'COACH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_level AS ENUM ('very_strong', 'strong', 'competitive', 'neutral', 'slightly_weak', 'weak', 'very_weak');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reaction_mode AS ENUM ('G', 'T', 'EK', 'OC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 1. 标签系统（树形结构）
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  parent_id   UUID REFERENCES tags(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- ============================================================
-- 2. 物料目录（Component）
-- ============================================================
CREATE TABLE IF NOT EXISTS components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(100) NOT NULL,
  name_cn         VARCHAR(500) NOT NULL,
  category        item_type NOT NULL,
  brand           VARCHAR(200) NOT NULL DEFAULT '',
  model           VARCHAR(200) NOT NULL DEFAULT '',
  specification   TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  supplier        VARCHAR(200) NOT NULL DEFAULT '',
  sourcing_type   sourcing_type NOT NULL,
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  design_hours    NUMERIC(10,2) NOT NULL DEFAULT 0,
  assembly_hours  NUMERIC(10,2) NOT NULL DEFAULT 0,
  has_warranty    BOOLEAN NOT NULL DEFAULT false,
  unit            VARCHAR(20) NOT NULL DEFAULT '个',
  review_status   review_status NOT NULL DEFAULT 'draft',
  version         VARCHAR(50) NOT NULL DEFAULT 'V1.0',
  tags            TEXT[] DEFAULT '{}',
  change_log      JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_components_code ON components(code);
CREATE INDEX IF NOT EXISTS idx_components_name ON components(name_cn);
CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
CREATE INDEX IF NOT EXISTS idx_components_tags ON components USING GIN(tags);

COMMENT ON TABLE components IS '物料目录/组件库';
COMMENT ON COLUMN components.change_log IS '变更记录：[{"version":"V1.0","date":"2024-01-01","note":"初始版本"}]';

-- ============================================================
-- 3. 项目（Project）
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_no            VARCHAR(100) NOT NULL,
  client_name         VARCHAR(500) NOT NULL,
  client_code         VARCHAR(100) NOT NULL DEFAULT '',
  project_scope       TEXT NOT NULL DEFAULT '',
  project_stage       VARCHAR(100) NOT NULL DEFAULT '',
  expected_award_date VARCHAR(100) NOT NULL DEFAULT '',
  project_layout      TEXT NOT NULL DEFAULT '',
  delivery_period     TEXT NOT NULL DEFAULT '',
  payment_terms       TEXT NOT NULL DEFAULT '',
  postfix             VARCHAR(100) NOT NULL DEFAULT '',
  note                TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sales_no)
);

CREATE INDEX IF NOT EXISTS idx_projects_sales_no ON projects(sales_no);
CREATE INDEX IF NOT EXISTS idx_projects_client_name ON projects(client_name);

-- 兼容列
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_name VARCHAR(500) NOT NULL DEFAULT '';

-- ============================================================
-- 4. 项目版本（ProjectVersion）
-- ============================================================
CREATE TABLE IF NOT EXISTS project_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no            VARCHAR(50) NOT NULL,
  eur_rate              NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(6,4) NOT NULL DEFAULT 0,
  rounding_digits       INTEGER NOT NULL DEFAULT 2,
  warranty_rate         NUMERIC(6,4) NOT NULL DEFAULT 0,
  risk_rate             NUMERIC(6,4) NOT NULL DEFAULT 0,
  commercial_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_direct_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_accounting_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discounted_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_rate         NUMERIC(6,4) NOT NULL DEFAULT 0,
  rp1_profit_rate       NUMERIC(6,4) NOT NULL DEFAULT 0,
  gp3_profit_rate       NUMERIC(6,4) NOT NULL DEFAULT 0,
  review_status         review_status NOT NULL DEFAULT 'draft',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);

-- 兼容列（后端 routes 使用的额外汇总字段）
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS warranty_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS risk_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS material_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS project_expense NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 5. 项目组（Group）
-- ============================================================
CREATE TABLE IF NOT EXISTS project_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id  UUID NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  group_no    INTEGER NOT NULL,
  group_type  group_type NOT NULL,
  name        VARCHAR(500) NOT NULL,
  is_fixed    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_groups_project_id ON project_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_version_id ON project_groups(version_id);

-- ============================================================
-- 6. 组内明细项（GroupItem）
-- ============================================================
CREATE TABLE IF NOT EXISTS group_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           UUID NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  item_no            INTEGER NOT NULL,
  item_type          item_type NOT NULL,
  component_id       UUID REFERENCES components(id),
  code               VARCHAR(200) NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  qty_total          NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit               VARCHAR(20) NOT NULL DEFAULT '个',
  sourcing_type      sourcing_type NOT NULL,
  unit_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  design_hours       NUMERIC(10,2) NOT NULL DEFAULT 0,
  assembly_hours     NUMERIC(10,2) NOT NULL DEFAULT 0,
  design_hour_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,
  assembly_hour_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  direct_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_rate        NUMERIC(6,4) NOT NULL DEFAULT 0,
  basic_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  accounting_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  has_warranty       BOOLEAN NOT NULL DEFAULT false,
  note               TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_group_items_group_id ON group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_group_items_component_id ON group_items(component_id);

-- ============================================================
-- 7. 销售机会（SalesOpportunity）
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_no            VARCHAR(100) NOT NULL,
  client_name         VARCHAR(500) NOT NULL,
  project_name        VARCHAR(500) NOT NULL,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  stage               opportunity_stage NOT NULL DEFAULT '信息',
  win_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  status              opportunity_status NOT NULL DEFAULT '过程中',
  salesman            VARCHAR(200) NOT NULL DEFAULT '',
  competitor          TEXT NOT NULL DEFAULT '',
  expected_close_date VARCHAR(100) NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  reasons             TEXT NOT NULL DEFAULT '',
  quotation_id        UUID,
  terminated          BOOLEAN NOT NULL DEFAULT false,
  promote_locked      BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sales_no)
);

-- 兼容已部署数据库（列可能已存在）
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS promote_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales_opportunities ADD COLUMN IF NOT EXISTS winner VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_status ON sales_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_stage ON sales_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_salesman ON sales_opportunities(salesman);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_created_at ON sales_opportunities(created_at);

COMMENT ON COLUMN sales_opportunities.reasons IS '状态变更原因，格式: 大类:子类:具体项;大类:子类';

-- ============================================================
-- 8. 销售蓝表（BlueTable）
-- ============================================================
CREATE TABLE IF NOT EXISTS blue_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL UNIQUE REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  veto_budget     veto_budget_option NOT NULL DEFAULT 'ok',
  budget_amount   NUMERIC(12,2),
  timeline_plan   TEXT NOT NULL DEFAULT '',
  timeline_option timeline_option NOT NULL DEFAULT 'neutral',
  pricing         pricing_level NOT NULL DEFAULT 'competitive',
  positioning     INTEGER NOT NULL DEFAULT 5 CHECK (positioning >= 1 AND positioning <= 10),
  reaction_mode   reaction_mode NOT NULL DEFAULT 'G',
  strategy        TEXT NOT NULL DEFAULT '',
  targets         JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE blue_tables IS '销售蓝表-策略销售赢率分析';
COMMENT ON COLUMN blue_tables.targets IS '行动目标：[{"roleId":"...","targetSupport":3,"plan":"..."}]';

-- ============================================================
-- 9. 蓝表角色（BlueTableRole）
-- ============================================================
CREATE TABLE IF NOT EXISTS blue_table_roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blue_table_id    UUID NOT NULL REFERENCES blue_tables(id) ON DELETE CASCADE,
  role_type        role_type NOT NULL,
  name             VARCHAR(200),
  influence        influence_level NOT NULL DEFAULT 'medium',
  influence_weight INTEGER NOT NULL DEFAULT 3 CHECK (influence_weight >= 1 AND influence_weight <= 10),
  support          INTEGER NOT NULL DEFAULT 0 CHECK (support >= -5 AND support <= 5),
  demand_fit       INTEGER NOT NULL DEFAULT 3 CHECK (demand_fit >= 1 AND demand_fit <= 5),
  relationship     INTEGER NOT NULL DEFAULT 3 CHECK (relationship >= 1 AND relationship <= 5)
);

CREATE INDEX IF NOT EXISTS idx_blue_table_roles_blue_table_id ON blue_table_roles(blue_table_id);

-- ============================================================
-- 10. 报价摘要（QuotationSummary）
-- ============================================================
CREATE TABLE IF NOT EXISTS quotations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sales_no        VARCHAR(100) NOT NULL,
  client_name     VARCHAR(500) NOT NULL,
  project_name    VARCHAR(500) NOT NULL,
  version_no      VARCHAR(50) NOT NULL DEFAULT '',
  status          review_status NOT NULL DEFAULT 'draft',
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_rate     NUMERIC(6,4) NOT NULL DEFAULT 0,
  opportunity_id  UUID REFERENCES sales_opportunities(id),
  locked          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_quotations_sales_no ON quotations(sales_no);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);

-- ============================================================
-- 11. 审批请求（ApprovalRequest）
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type   approval_type NOT NULL,
  quotation_id    VARCHAR(100) NOT NULL,
  opportunity_id  UUID,
  delivery_id     UUID,
  sales_no        VARCHAR(100) NOT NULL,
  client_name     VARCHAR(500) NOT NULL,
  project_name    VARCHAR(500) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_rate     NUMERIC(6,4) NOT NULL DEFAULT 0,
  gp3             NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(4,2) NOT NULL DEFAULT 0.13,
  submitter       VARCHAR(200) NOT NULL DEFAULT '',
  submit_time     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          review_status NOT NULL DEFAULT 'draft',
  version_no      VARCHAR(20) NOT NULL DEFAULT 'V1.0',
  total_accounting_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discounted_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 兼容列（为已有数据库添加新列，PG 9.6+ 支持 IF NOT EXISTS）
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS version_no VARCHAR(20) NOT NULL DEFAULT 'V1.0';
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS total_accounting_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS discounted_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(6,4) NOT NULL DEFAULT 0;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS gp3_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_type ON approval_requests(approval_type);

-- ============================================================
-- 12. 审批记录（ReviewRecord）
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id  UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  reviewer             VARCHAR(200) NOT NULL,
  action               approval_action NOT NULL,
  comment              TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_records_request_id ON approval_records(approval_request_id);

-- ============================================================
-- 13. 交付项目（DeliveryProject）
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    UUID NOT NULL,
  sales_no          VARCHAR(100) NOT NULL,
  client_name       VARCHAR(500) NOT NULL,
  project_name      VARCHAR(500) NOT NULL,
  contract_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  quotation_id      VARCHAR(100) NOT NULL DEFAULT '',
  status            delivery_status NOT NULL DEFAULT '进行中',
  plan_status       review_status NOT NULL DEFAULT 'draft',
  plan_approval     JSONB,
  cost_status       review_status NOT NULL DEFAULT 'draft',
  cost_approval     JSONB,
  total_actual_cost NUMERIC(12,2),
  terminated        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_projects_status ON delivery_projects(status);
CREATE INDEX IF NOT EXISTS idx_delivery_projects_opportunity_id ON delivery_projects(opportunity_id);

COMMENT ON COLUMN delivery_projects.plan_approval IS '实施计划审批结果：{"reviewer":"...","action":"approved","comment":"...","createdAt":"..."}';
COMMENT ON COLUMN delivery_projects.cost_approval IS '成本对比审批结果：同上格式';

-- ============================================================
-- 14. 交付节点（DeliveryNode）
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_nodes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_project_id  UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
  node_no              INTEGER NOT NULL,
  name                 VARCHAR(500) NOT NULL,
  planned_start_date   VARCHAR(100) NOT NULL DEFAULT '',
  planned_end_date     VARCHAR(100) NOT NULL DEFAULT '',
  actual_date          VARCHAR(100),
  actual_start_date    VARCHAR(100),
  actual_end_date      VARCHAR(100),
  baseline_planned_end_date VARCHAR(100),
  status               node_status NOT NULL DEFAULT 'pending',
  comments             TEXT NOT NULL DEFAULT '',
  history              JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_nodes_project_id ON delivery_nodes(delivery_project_id);

COMMENT ON COLUMN delivery_nodes.history IS '变更历史：[{"id":"...","field":"status","oldValue":"...","newValue":"...","changedAt":"..."}]';

-- ============================================================
-- 15. 客户（Client）
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(100) NOT NULL,
  name         VARCHAR(500) NOT NULL,
  type         account_type NOT NULL DEFAULT 'enterprise',
  parent_id    UUID REFERENCES clients(id),
  industry     VARCHAR(200) NOT NULL DEFAULT '',
  region       VARCHAR(200) NOT NULL DEFAULT '',
  salesman     VARCHAR(200) NOT NULL DEFAULT '',
  credit_level credit_level NOT NULL DEFAULT 'B',
  grade        client_grade NOT NULL DEFAULT 'B',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(code);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- ============================================================
-- 16. 客户联系人（Contact）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  position      VARCHAR(200) NOT NULL DEFAULT '',
  phone         VARCHAR(100) NOT NULL DEFAULT '',
  email         VARCHAR(200) NOT NULL DEFAULT '',
  decision_role decision_role NOT NULL DEFAULT '使用',
  superior      VARCHAR(200) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);

-- ============================================================
-- 17. 客户历史记录（ClientHistoryRecord）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_name VARCHAR(500) NOT NULL,
  sales_no     VARCHAR(100) NOT NULL,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT '',
  date         VARCHAR(100) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_client_history_client_id ON client_history(client_id);

-- ============================================================
-- updated_at 自动更新触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_components_updated_at BEFORE UPDATE ON components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_project_versions_updated_at BEFORE UPDATE ON project_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_project_groups_updated_at BEFORE UPDATE ON project_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_sales_opportunities_updated_at BEFORE UPDATE ON sales_opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON approval_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_delivery_projects_updated_at BEFORE UPDATE ON delivery_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_delivery_nodes_updated_at BEFORE UPDATE ON delivery_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 18. 操作日志（audit_logs）
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name   VARCHAR(200) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  module      VARCHAR(100) NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
