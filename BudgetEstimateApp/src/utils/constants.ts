/**
 * 共享常量定义
 * 提取跨文件重复的常量，统一维护
 */

import { COLORS } from '../styles/colors';

// ── 机会阶段颜色（B14：SalesAnalysis 与 SalesOpportunityList 双份收敛单源） ──
// '中标' 为占位桶：stageAsOf 只到'议价'（无中标阶段时间戳），该桶恒 0；赢单累计由 won 折线展示
export const STAGE_COLORS: Record<string, string> = {
  信息: COLORS.textLight, 线索: COLORS.primary, 机会: COLORS.purple,
  投标: COLORS.warning, 议价: COLORS.amber, 中标: COLORS.success,
};

// ── 交付节点名称（标准 15 节点） ──
// 用于交付数据结构生成（与数据库 delivery_nodes.name 对应）
export const NODE_NAMES = [
  'Handover', '合同签订', 'Kickoff', '方案细化', '技术会签',
  '详细设计', '设计评审', '制造采购', '组装调试', '出厂验收',
  '包装发货', '现场安调', '验收整改', '终验收', '项目总结',
] as const;

/**
 * 交付节点中间显示名称（中文，两行格式）
 * 用于 DeliveryAnalysis SVG 渲染，与 NODE_NAMES 一一对应
 */
export const NODE_DISPLAY_NAMES = [
  '资料\n交接', '合同\n签订', '项目\n启动', '方案\n细化', '技术\n会签',
  '详细\n设计', '设计\n评审', '制造\n采购', '组装\n调试', '出厂\n验收',
  '包装\n发货', '现场\n安调', '验收\n整改', '终\n验收', '项目\n总结',
] as const;

/** 交付节点执行状态文案映射：DeliveryNodeTimeline/DeliveryDetail 两处逐字重复收敛单源（F08，对齐 TR TASK_STATUS_META 模式） */
export const NODE_STATUS_META: Record<string, string> = {
  pending: '未开始', in_progress: '进行中', completed: '已完成',
};

// ── 默认业务常量 ──
export const DEFAULT_DESIGN_HOURLY_RATE = 175;
export const DEFAULT_ASSEMBLY_HOURLY_RATE = 85;

/** 默认增值税率 13%（⚠️ B22：报价版本 taxRate 缺省回退值，全应用统一，散落魔法数字收敛至此） */
export const TAX_RATE = 0.13;

// ── 列表接口统一拉取上限 ──
// 对齐后端 parsePagination PAGE_LIMIT=100000；前端聚合/全量读取（仪表盘/分析/管理页）显式传此值，
// 防数据量上涨后静默截断——此前散落的 limit:'1000' 在 20+ 员工正式部署下会截断聚合数据
export const LIST_LIMIT = '100000';
