-- 031-seed-tags.sql
-- 标签树种子数据：替代前端 TagManagement.tsx 中的 INLINE_TAG_TREE（mock 数据）
-- 测试数据统一在数据库中创建和管理，不再在代码里使用 mock。
--
-- 幂等：同名同父的标签已存在则跳过，不重复插入、不删除已有数据
-- （components.tags 为 TEXT[] 按标签名引用，避免破坏）。
--
-- 使用方式：
--   psql -h <host> -p <port> -U budget_app -d budget_estimate -f 031-seed-tags.sql

BEGIN;

DO $$
DECLARE
  r RECORD;
  pid UUID;
  existing_id UUID;
BEGIN
  -- 种子数据（DFS 先序遍历：父在前、子在后；parent_name 为空表示一级标签）
  CREATE TEMP TABLE IF NOT EXISTS tmp_tag_seed (seq INT, name TEXT, parent_name TEXT, sort_order INT) ON COMMIT DROP;
  TRUNCATE tmp_tag_seed;
  INSERT INTO tmp_tag_seed (seq, name, parent_name, sort_order) VALUES
    -- 一级标签
    (1,   '上下料系统', NULL, 0),
    (2,   '桁架上下料', '上下料系统', 0),
    (3,   '桁架机械手', '桁架上下料', 0),
    (4,   '吸盘架',     '桁架上下料', 1),
    (5,   '输送系统',   NULL, 1),
    (6,   '辊道输送',   '输送系统', 0),
    (7,   '皮带输送',   '输送系统', 1),
    (8,   'RGV小车',    '输送系统', 2),
    (9,   'AGV搬运',    '输送系统', 3),
    (10,  '加工设备',   NULL, 2),
    (11,  '激光切割',   '加工设备', 0),
    (12,  '冲压',       '加工设备', 1),
    (13,  '折弯',       '加工设备', 2),
    (14,  '机器人系统', NULL, 3),
    (15,  '机器人上下料', '机器人系统', 0),
    (16,  '机器人抓手', '机器人上下料', 0),
    (17,  '分拣机构',   '机器人上下料', 1),
    (18,  '机器人地轨', '机器人上下料', 2),
    (19,  '六轴机器人', '机器人系统', 1),
    (20,  '协作机器人', '机器人系统', 2),
    (21,  '焊接工作站', '机器人系统', 3),
    (22,  '机器人控制系统', '机器人系统', 4),
    (23,  '仓储设备',   NULL, 4),
    (24,  '堆垛机',     '仓储设备', 0),
    (25,  '料塔',       '仓储设备', 1),
    (26,  '提升机',     '仓储设备', 2),
    (27,  '托盘',       '仓储设备', 3),
    (28,  '拆包台',     '仓储设备', 4),
    (29,  '倒托设备',   '仓储设备', 5),
    (30,  '控制系统',   NULL, 5),
    (31,  'PLC控制柜',  '控制系统', 0),
    (32,  '配电柜',     '控制系统', 1),
    (33,  '操作终端',   '控制系统', 2),
    (34,  '工业PC',     '控制系统', 3),
    (35,  '网络布线',   '控制系统', 4),
    (36,  '服务器',     '控制系统', 5),
    (37,  '检测/视觉',  NULL, 6),
    (38,  '视觉检测',   '检测/视觉', 0),
    (39,  '传感检测',   '检测/视觉', 1),
    (40,  '测量系统',   '检测/视觉', 2),
    (41,  '安全防护',   NULL, 7),
    (42,  '包装运输',   NULL, 8),
    (43,  '工程服务',   NULL, 9),
    (44,  '设计工费',   '工程服务', 0),
    (45,  '装配工费',   '工程服务', 1),
    (46,  '安装工费',   '工程服务', 2),
    (47,  '调试工费',   '工程服务', 3),
    (48,  '培训工费',   '工程服务', 4),
    (49,  '陪产工费',   '工程服务', 5),
    (50,  '项目管理工费', '工程服务', 6),
    (51,  '软件系统',   NULL, 10);

  -- 本次运行内 名称→id 映射（父先处理后，子可直接取到）
  CREATE TEMP TABLE IF NOT EXISTS tmp_tag_id (name TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
  TRUNCATE tmp_tag_id;

  FOR r IN SELECT * FROM tmp_tag_seed ORDER BY seq LOOP
    pid := NULL;
    IF r.parent_name IS NOT NULL THEN
      SELECT id INTO pid FROM tmp_tag_id WHERE name = r.parent_name;
    END IF;

    -- 幂等：同名同父已存在则跳过
    SELECT id INTO existing_id
    FROM tags
    WHERE name = r.name AND parent_id IS NOT DISTINCT FROM pid
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO tags (name, parent_id, sort_order)
      VALUES (r.name, pid, r.sort_order)
      RETURNING id INTO existing_id;
    END IF;

    INSERT INTO tmp_tag_id (name, id) VALUES (r.name, existing_id) ON CONFLICT (name) DO NOTHING;
  END LOOP;

  RAISE NOTICE '✅ 标签树种子完成（% 个节点，已存在的节点自动跳过）', (SELECT count(*) FROM tmp_tag_id);
END $$;

COMMIT;
