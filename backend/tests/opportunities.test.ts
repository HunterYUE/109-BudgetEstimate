import { describe, it, expect } from 'vitest';
import { AppError } from '../src/middleware/index.js';
import {
  buildOppStatusClauses,
  normalizeBlueTableRole,
  buildSalesNoPrefix,
  composeSalesNo,
  STAGE_LEAD,
  STAGE_OPPORTUNITY,
  STAGE_BID,
  STAGE_NEGOTIATION,
  OPP_UPDATE_EXCLUDE,
} from '../src/routes/opportunities.js';

describe('buildOppStatusClauses 机会状态机（lost_at 采集/离开清除/四阶段 COALESCE/转交付三分支 + A105 防伪赢单）', () => {
  it('状态变"输"：lost_at = now() 记录当次输单', () => {
    const sql = buildOppStatusClauses({ status: '输' }, undefined, false);
    expect(sql).toContain('lost_at = now()');
    expect(sql).not.toContain('lost_at = NULL');
  });
  it('状态离开"输"（赢/恢复过程中/冻结）：lost_at 清空，且不再追加 lost_at = now()', () => {
    const sql = buildOppStatusClauses({ status: '赢', stage: '中标' }, undefined, false);
    expect(sql).toContain('lost_at = NULL');
    expect(sql).not.toContain('lost_at = now()');
  });
  it('四阶段 COALESCE：进入各阶段首写不覆盖（服务端采集时间戳）', () => {
    const sql = buildOppStatusClauses({ stage: '投标' }, undefined, false);
    expect(sql).toContain('lead_at = COALESCE(lead_at, now())');
    expect(sql).toContain('opportunity_at = COALESCE(opportunity_at, now())');
    expect(sql).toContain('bid_at = COALESCE(bid_at, now())');
    expect(sql).not.toContain('negotiation_at');
  });
  it('转交付 + 已交付 + 当前赢：won_at COALESCE（转交付时间作赢单确认），不改状态', () => {
    const sql = buildOppStatusClauses({ terminated: true }, '赢', true);
    expect(sql).toContain('won_at = COALESCE(won_at, now())');
    expect(sql).not.toContain("status = '赢'");
  });
  it('转交付 + 已交付 + 当前输：置赢/中标 + won_at + 清 lost_at（最终审计修正：转交付=赢单终极确认）', () => {
    const sql = buildOppStatusClauses({ terminated: true }, '输', true);
    expect(sql).toContain("status = '赢'");
    expect(sql).toContain("stage = '中标'");
    expect(sql).toContain('won_at = COALESCE(won_at, now())');
    expect(sql).toContain('lost_at = NULL');
  });
  it('转交付 + 已交付 + 过程中/冻结：100% 确认为赢单', () => {
    const sql = buildOppStatusClauses({ terminated: true }, '机会', true);
    expect(sql).toContain("status = '赢', stage = '中标', won_at = COALESCE(won_at, now())");
  });
  it('转交付 + 无交付 + 非输：抛 400（A105 防仅持写权限者伪造 terminated 直接标赢）', () => {
    expect(() => buildOppStatusClauses({ terminated: true }, '机会', false))
      .toThrow(AppError);
    expect(() => buildOppStatusClauses({ terminated: true }, '机会', false))
      .toThrow(/转交付须先创建交付项目/);
  });
  it('转交付 + 无交付 + 输：仅归档不追加子句（不改状态/won_at）', () => {
    expect(buildOppStatusClauses({ terminated: true }, '输', false)).toBe('');
  });
  it('非转交付：不追加任何 won_at 子句', () => {
    const sql = buildOppStatusClauses({ status: '赢', stage: '中标' }, undefined, false);
    expect(sql).not.toContain('won_at');
    expect(sql).not.toContain("status = '赢'");
  });
});

describe('normalizeBlueTableRole 蓝表角色参数归一化（默认值：medium/权重3/支持0/需求契合3/关系3）', () => {
  it('空对象 → 全默认', () => {
    expect(normalizeBlueTableRole({})).toEqual({
      role_type: '', name: '', influence: 'medium', influence_weight: 3,
      support: 0, demand_fit: 3, relationship: 3,
    });
  });
  it('camelCase 键转 snake + 已有值保留', () => {
    expect(normalizeBlueTableRole({
      roleType: '决策者', name: '王总', influence: 'high', influenceWeight: 5,
      support: 1, demandFit: 4, relationship: 5,
    })).toEqual({
      role_type: '决策者', name: '王总', influence: 'high', influence_weight: 5,
      support: 1, demand_fit: 4, relationship: 5,
    });
  });
});

describe('buildSalesNoPrefix / composeSalesNo 销售编号（A{YYYY}-{MM}-{NNN}-S，pad3）', () => {
  it('前缀按年月', () => {
    expect(buildSalesNoPrefix(new Date(2026, 7, 5))).toBe('A2026-08-');
    expect(buildSalesNoPrefix(new Date(2025, 0, 1))).toBe('A2025-01-');
  });
  it('序号 padStart(3,0) 补零', () => {
    expect(composeSalesNo(new Date(2026, 7, 5), 5)).toBe('A2026-08-005-S');
    expect(composeSalesNo(new Date(2026, 7, 5), 123)).toBe('A2026-08-123-S');
  });
});

describe('阶段/更新排除常量（状态机与服务端采集唯一依据）', () => {
  it('阶段逐级递进：线索⊂机会⊂投标⊂议价⊂中标', () => {
    expect(STAGE_LEAD).toEqual(['线索', '机会', '投标', '议价', '中标']);
    expect(STAGE_OPPORTUNITY).toEqual(['机会', '投标', '议价', '中标']);
    expect(STAGE_BID).toEqual(['投标', '议价', '中标']);
    expect(STAGE_NEGOTIATION).toEqual(['议价', '中标']);
  });
  it('生命周期字段禁直设：id/时间戳 + 五阶段时间戳全在排除列', () => {
    for (const f of ['id', 'created_at', 'updated_at', 'won_at', 'lost_at', 'lead_at', 'opportunity_at', 'bid_at', 'negotiation_at']) {
      expect(OPP_UPDATE_EXCLUDE).toContain(f);
    }
  });
});
