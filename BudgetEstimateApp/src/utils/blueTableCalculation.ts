import type { BlueTable, RoleType, InfluenceLevel } from '../types';

/** 价格竞争力对应的百分点修正值 */
export const PRICING_ADJUSTMENTS: Record<string, number> = {
  very_strong: 15,
  strong: 10,
  competitive: 5,
  neutral: 0,
  slightly_weak: -5,
  weak: -10,
  very_weak: -15,
};

export const PRICING_LABELS: Record<string, string> = {
  very_strong: '很强',
  strong: '强',
  competitive: '较强',
  neutral: '平均',
  slightly_weak: '较弱',
  weak: '弱',
  very_weak: '很弱',
};

/** 影响力默认权重 */
export const INFLUENCE_DEFAULT_WEIGHT: Record<string, number> = {
  high: 5,
  medium: 3,
  low: 1,
};

/** EB 角色专用权重（决策者影响力更大） */
export const EB_INFLUENCE_WEIGHT: Record<string, number> = {
  high: 10,
  medium: 5,
  low: 1,
};

/** 根据角色类型和影响力级别获取默认权重 */
export function getDefaultWeight(roleType: RoleType, influence: InfluenceLevel): number {
  if (roleType === 'EB') return EB_INFLUENCE_WEIGHT[influence];
  return INFLUENCE_DEFAULT_WEIGHT[influence];
}

const POSITIONING_LABELS: string[] = [
  '陶醉', '太棒了', '安稳', '舒服', 'OK',
  '顾虑', '不舒服', '担心', '害怕', '惊慌',
];

const POSITIONING_EXPLANATIONS: Record<number, string> = {
  1: '客户极度认可，基本拿下',
  2: '客户非常满意',
  3: '项目稳固，无明显风险',
  4: '进展顺利，关系良好',
  5: '正常推进',
  6: '客户有未被解决的顾虑',
  7: '出现明显问题',
  8: '有竞争对手领先或我方劣势',
  9: '项目可能丢失',
  10: '基本确定要输了',
};

const REACTION_LABELS: Record<string, string> = {
  G: 'G（增长）',
  T: 'T（困难）',
  EK: 'EK（平稳）',
  OC: 'OC（自满）',
};

const REACTION_EXPLANATIONS: Record<string, { desc: string; strategy: string }> = {
  G: { desc: '客户想变得更好', strategy: '容易争取支持，但有竞争' },
  T: { desc: '客户遇到麻烦', strategy: '支持意愿强，抓紧解决核心问题' },
  EK: { desc: '客户认为现状挺好', strategy: '难获得支持，需制造痛点' },
  OC: { desc: '客户过度自信', strategy: '极难，除非客户自身觉醒' },
};

export { POSITIONING_LABELS, POSITIONING_EXPLANATIONS, REACTION_LABELS, REACTION_EXPLANATIONS };

export interface CalcIntermediate {
  vetoed: boolean;
  baseSupportScore: number;           // 基础支持度分 0~100
  rolePenalty: number;                // 角色缺失修正系数
  reactionFactor: number;             // 反应模式修正系数
  pricingAdjustment: number;          // 价格竞争力修正值（百分点）
  budgetPenalty: number;              // 预算紧张扣减（百分点）
  timelinePenalty: number;            // 节点中性扣减（百分点）
  midRate: number;                    // 乘法链后的中间值
  finalRate: number;                  // 最终赢率 0~90
  missingEB: boolean;
  missingCoach: boolean;
}

/**
 * 计算销售蓝表赢率
 * 返回最终赢率（0~90）以及所有中间值用于展示
 */
export function calcBlueTableWinRate(blueTable: BlueTable): CalcIntermediate {
  const result: CalcIntermediate = {
    vetoed: false,
    baseSupportScore: 0,
    rolePenalty: 1,
    reactionFactor: 1,
    pricingAdjustment: 0,
    budgetPenalty: 0,
    timelinePenalty: 0,
    midRate: 0,
    finalRate: 0,
    missingEB: false,
    missingCoach: false,
  };

  // Step 1: 否决检查
  if (blueTable.vetoBudget === 'failed' || blueTable.timelineOption === 'negative') {
    result.vetoed = true;
    result.finalRate = 0;
    return result;
  }

  const roles = blueTable.roles;
  if (roles.length === 0) {
    result.finalRate = 0;
    return result;
  }

  // Step 2: 角色缺失判断（检查是否有至少一人担任该角色类型）
  const hasEB = roles.some(r => r.roleType === 'EB');
  const hasCoach = roles.some(r => r.roleType === 'COACH');
  result.missingEB = !hasEB;
  result.missingCoach = !hasCoach;

  if (!hasEB && !hasCoach) result.rolePenalty = 0.4;
  else if (!hasEB) result.rolePenalty = 0.5;
  else if (!hasCoach) result.rolePenalty = 0.85;
  else result.rolePenalty = 1.0;

  // Step 3: 支持度加权平均（使用 influenceWeight 直接作为权重）
  let totalWeight = 0;
  let weightedSupport = 0;

  for (const role of roles) {
    const w = role.influenceWeight;
    const normSupport = (role.support + 5) / 10; // -5→0, 0→0.5, +5→1
    totalWeight += w;
    weightedSupport += w * normSupport;
  }

  if (totalWeight === 0) {
    result.finalRate = 0;
    return result;
  }

  result.baseSupportScore = (weightedSupport / totalWeight) * 100;

  // Step 4: 反应模式修正
  result.reactionFactor = blueTable.reactionMode === 'OC' ? 0.8 : 1.0;

  // Step 5: 乘法链
  result.midRate = result.baseSupportScore * result.rolePenalty * result.reactionFactor;

  // Step 6: 价格竞争力修正（加法）
  result.pricingAdjustment = PRICING_ADJUSTMENTS[blueTable.pricing] ?? 0;
  const withPricing = result.midRate + result.pricingAdjustment;

  // Step 7: 项目预算扣减（紧张 -5%）
  result.budgetPenalty = blueTable.vetoBudget === 'possible' ? 5 : 0;
  // Step 8: 项目节点扣减（中性 -5%）
  result.timelinePenalty = blueTable.timelineOption === 'neutral' ? 5 : 0;
  const withPenalties = withPricing - result.budgetPenalty - result.timelinePenalty;

  // Step 9: 最终封顶
  result.finalRate = Math.max(0, Math.min(90, Math.round(withPenalties)));
  return result;
}
