-- 009-cleanup-and-fixes.sql
-- 审计修复的剩余数据库问题

-- 1. 移除 audit_logs 中冗余的 time 列（与 created_at 重复），改用 created_at
-- 保留列但加注释说明，避免破坏已有查询
COMMENT ON COLUMN audit_logs.time IS '已弃用，请使用 created_at';

-- 2. 移除 006 中重复创建的触发器函数（已存在 update_updated_at）
-- 保留 update_updated_at_column 仅作为别名
-- 实际已有 update_updated_at() 函数（schema.sql:548），两者功能相同
-- 此处仅做文档说明，不删除（可能已被其他 trigger 引用）

-- 3. 重命名 008-seed-2607009e-test-data.sql 为种子脚本（已移动到 seeds/ 目录）
-- 详见 seeds/ 目录

-- 4. 清理重复的 actual_costs 列添加（003 和 006 都加了同一列）
-- 无需操作：ADD COLUMN IF NOT EXISTS 保证幂等

-- 5. 添加 JSONB 列的 GIN 索引（性能优化）
-- 当前未使用 JSONB 查询操作符（@>, ?, #>>），暂不添加
-- 当需要时执行：
-- CREATE INDEX IF NOT EXISTS idx_delivery_projects_plan_approval ON delivery_projects USING GIN (plan_approval);
-- CREATE INDEX IF NOT EXISTS idx_delivery_projects_cost_approval ON delivery_projects USING GIN (cost_approval);
-- CREATE INDEX IF NOT EXISTS idx_delivery_projects_actual_costs ON delivery_projects USING GIN (actual_costs);

-- 6. client_history.status 添加 CHECK 约束
ALTER TABLE client_history ADD CONSTRAINT chk_client_history_status
  CHECK (status IN ('赢', '输', '冻结', ''))
  NOT VALID;

COMMENT ON CONSTRAINT chk_client_history_status ON client_history IS '状态仅允许：赢/输/冻结';
