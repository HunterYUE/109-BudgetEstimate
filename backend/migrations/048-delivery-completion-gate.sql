-- 048: 交付完成门禁（数据库最终防线）
-- 规则：项目置为「已完成」时，必须成本审批通过、节点全部完成、节点15有实际完成日；
--      已完成项目不可回退状态。应用层已有同口径校验，本触发器消除并发窗口。
-- 幂等：CREATE OR REPLACE FUNCTION + 触发器存在性判断。

BEGIN;

CREATE OR REPLACE FUNCTION check_delivery_completion() RETURNS trigger AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status IS DISTINCT FROM '已完成' THEN
    IF NEW.cost_status <> 'approved' THEN
      RAISE EXCEPTION '成本对比审批通过后才能完成项目' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM delivery_nodes WHERE delivery_project_id = NEW.id) THEN
      RAISE EXCEPTION '交付项目尚无节点，不能完成' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM delivery_nodes WHERE delivery_project_id = NEW.id AND status <> 'completed') THEN
      RAISE EXCEPTION '尚有节点未完成' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM delivery_nodes
      WHERE delivery_project_id = NEW.id AND node_no = 15 AND status = 'completed'
        AND ((actual_date IS NOT NULL AND actual_date <> '') OR (actual_end_date IS NOT NULL AND actual_end_date <> ''))
    ) THEN
      RAISE EXCEPTION '节点15完成必须填写实际完成日期' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = '已完成' AND NEW.status <> '已完成' THEN
    RAISE EXCEPTION '已完成项目不可回退状态' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_delivery_completion_gate') THEN
    CREATE TRIGGER trg_delivery_completion_gate BEFORE UPDATE OF status ON delivery_projects
      FOR EACH ROW EXECUTE FUNCTION check_delivery_completion();
  END IF;
END $$;

COMMIT;
