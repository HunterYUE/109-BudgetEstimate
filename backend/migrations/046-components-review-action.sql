-- 046: components.review_action —— 物料审核工作流与业务备注解耦
-- 背景：此前用 note 的 '[新建]/[删除]' 前缀承载审核动作，用户填写/编辑备注会覆盖或伪造工作流标记
--       （编辑备注以 [删除] 开头再保存 → 审批通过即永久删除物料）。改为独立列。
-- 幂等：可重复执行（IF NOT EXISTS + 条件回填）。

BEGIN;

ALTER TABLE components ADD COLUMN IF NOT EXISTS review_action VARCHAR(20) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'components_review_action_check'
  ) THEN
    ALTER TABLE components
      ADD CONSTRAINT components_review_action_check
      CHECK (review_action = ANY (ARRAY['', 'create', 'update', 'delete']));
  END IF;
END $$;

-- 回填存量标记（旧实现只写精确的 '[新建]' / '[删除]'）
UPDATE components SET review_action = 'delete' WHERE review_action = '' AND note LIKE '[删除]%';
UPDATE components SET review_action = 'create' WHERE review_action = '' AND note LIKE '[新建]%';
UPDATE components SET note = '' WHERE note IN ('[新建]', '[删除]') AND review_action IN ('create', 'delete');

COMMIT;
