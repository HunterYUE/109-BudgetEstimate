import { describe, it, expect } from 'vitest';
import type { BlueTable, BlueTableRole } from '../src/types';
import {
  PRICING_ADJUSTMENTS, PRICING_LABELS, getDefaultWeight,
  calcBlueTableWinRate,
} from '../src/utils/blueTableCalculation';

function role(over: Partial<BlueTableRole>): BlueTableRole {
  return { id: 'r', roleType: 'EB', influence: 'high', influenceWeight: 5, support: 0, demandFit: 3, relationship: 3, ...over } as any;
}
function table(over: Partial<BlueTable>): BlueTable {
  return {
    vetoBudget: 'ok', timelinePlan: '', timelineOption: 'optimistic', roles: [],
    pricing: 'competitive', positioning: 5, reactionMode: 'G', strategy: '', targets: [], updatedAt: '',
    ...over,
  } as any;
}

describe('PRICING_ADJUSTMENTS / getDefaultWeight', () => {
  it('价格竞争力修正表', () => {
    expect(PRICING_ADJUSTMENTS.very_strong).toBe(15);
    expect(PRICING_ADJUSTMENTS.competitive).toBe(5);
    expect(PRICING_ADJUSTMENTS.neutral).toBe(0);
    expect(PRICING_ADJUSTMENTS.very_weak).toBe(-15);
    expect(PRICING_LABELS.strong).toBe('强');
  });
  it('影响力默认权重：EB 高=10，其余高=5/中=3/低=1', () => {
    expect(getDefaultWeight('EB', 'high')).toBe(10);
    expect(getDefaultWeight('EB', 'medium')).toBe(5);
    expect(getDefaultWeight('COACH', 'high')).toBe(5);
    expect(getDefaultWeight('UB', 'medium')).toBe(3);
    expect(getDefaultWeight('TB', 'low')).toBe(1);
  });
});

describe('calcBlueTableWinRate 赢率', () => {
  it('否决：预算失败 / 时间负面 → 直接 0', () => {
    expect(calcBlueTableWinRate(table({ vetoBudget: 'failed' })).finalRate).toBe(0);
    expect(calcBlueTableWinRate(table({ vetoBudget: 'failed' })).vetoed).toBe(true);
    const neg = calcBlueTableWinRate(table({ timelineOption: 'negative' }));
    expect(neg.finalRate).toBe(0);
    expect(neg.vetoed).toBe(true);
  });
  it('无角色 → 0', () => {
    expect(calcBlueTableWinRate(table({})).finalRate).toBe(0);
  });
  it('EB 高支持 + COACH 中支持 + 竞争价格 → 封顶 90', () => {
    const t = table({
      roles: [role({ roleType: 'EB', influence: 'high', influenceWeight: 10, support: 5 }), role({ roleType: 'COACH', influence: 'medium', influenceWeight: 3, support: 3 })],
      pricing: 'competitive', // +5
    });
    const r = calcBlueTableWinRate(t);
    expect(r.missingEB).toBe(false);
    expect(r.missingCoach).toBe(false);
    expect(r.rolePenalty).toBe(1);
    expect(r.baseSupportScore).toBeCloseTo((10 * 1.0 + 3 * 0.8) / 13 * 100, 5); // ≈ 95.38
    expect(r.midRate).toBeCloseTo(95.38, 2);
    expect(r.finalRate).toBe(90); // 封顶
  });
  it('OC 反应模式 ×0.8', () => {
    const r = calcBlueTableWinRate(table({
      roles: [role({ roleType: 'EB', influence: 'high', influenceWeight: 10, support: 5 }), role({ roleType: 'COACH', influence: 'medium', influenceWeight: 3, support: 3 })],
      reactionMode: 'OC',
    }));
    expect(r.reactionFactor).toBe(0.8);
    // baseSupportScore 95.3846 × 0.8 × 1.0 = 76.3077；+5（竞争价）= 81.3077 → round 81
    expect(r.midRate).toBeCloseTo(76.31, 2);
    expect(r.finalRate).toBe(81);
  });
  it('角色缺失惩罚：仅缺 EB ×0.5、仅缺 COACH ×0.85、双缺 ×0.4', () => {
    const noEb = calcBlueTableWinRate(table({ roles: [role({ roleType: 'COACH', influence: 'high', influenceWeight: 5, support: 5 })] }));
    expect(noEb.missingEB).toBe(true);
    expect(noEb.rolePenalty).toBe(0.5);
    const noCoach = calcBlueTableWinRate(table({ roles: [role({ roleType: 'EB', influence: 'high', influenceWeight: 5, support: 5 })] }));
    expect(noCoach.missingCoach).toBe(true);
    expect(noCoach.rolePenalty).toBe(0.85);
    const bothMissing = calcBlueTableWinRate(table({ roles: [role({ roleType: 'UB', influence: 'high', influenceWeight: 5, support: 5 })] }));
    expect(bothMissing.rolePenalty).toBe(0.4);
  });
  it('预算紧张 -5、时间中性 -5、价格很弱 -15 → 减法链', () => {
    const r = calcBlueTableWinRate(table({
      roles: [role({ roleType: 'EB', influence: 'high', influenceWeight: 5, support: 5 })], // 单 EB：×0.85
      vetoBudget: 'possible', timelineOption: 'neutral', pricing: 'very_weak', // -5 -5 -15
    }));
    // baseSupportScore = 100；midRate = 100 × 0.85 × 1.0 = 85；85 -15 -5 -5 = 60
    expect(r.finalRate).toBe(60);
  });
  it('全角色权重 0/NaN → finalRate 0（畸形数据防御：totalWeight 不 >0 兜底）', () => {
    expect(calcBlueTableWinRate(table({ roles: [role({ influenceWeight: 0, support: 5 })] })).finalRate).toBe(0);
    expect(calcBlueTableWinRate(table({ roles: [role({ influenceWeight: NaN, support: 5 })] })).finalRate).toBe(0);
  });
  it('最终赢率钳制在 [0, 90]', () => {
    const r = calcBlueTableWinRate(table({ roles: [role({ roleType: 'EB', influence: 'high', influenceWeight: 5, support: 5 }), role({ roleType: 'COACH', influence: 'high', influenceWeight: 5, support: 5 })] }));
    expect(r.finalRate).toBeLessThanOrEqual(90);
  });
});
