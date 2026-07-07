import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Table, Tooltip, message } from 'antd';
import { CloseOutlined, CheckOutlined, DeleteOutlined, PlusOutlined, RiseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { BlueTable, BlueTableRole, VetoBudgetOption, TimelineOption, InfluenceLevel, PricingLevel, ReactionMode, SalesOpportunity, RoleType } from '../types';
import { PRICING_ADJUSTMENTS, PRICING_LABELS, POSITIONING_LABELS, POSITIONING_EXPLANATIONS, REACTION_LABELS, REACTION_EXPLANATIONS, calcBlueTableWinRate, getDefaultWeight, type CalcIntermediate } from '../utils/blueTableCalculation';
import { COLORS } from '../styles/constants';

interface BlueTableModalProps {
  open: boolean;
  opportunity: SalesOpportunity | null;
  onSave: (blueTable: BlueTable) => void;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  EB: 'EB',
  UB: 'UB',
  TB: 'TB',
  COACH: 'COACH',
};

// ── 默认角色 ──
function defaultRole(overrides?: Partial<BlueTableRole>): BlueTableRole {
  const roleType = overrides?.roleType || 'EB';
  const influence = overrides?.influence || 'medium';
  return {
    id: 'role-' + crypto.randomUUID().slice(0, 6),
    roleType,
    name: '',
    influence,
    influenceWeight: getDefaultWeight(roleType, influence),
    support: -1,
    demandFit: 3,
    relationship: 3,
    ...overrides,
  };
}

function createEmptyBlueTable(): BlueTable {
  return {
    vetoBudget: 'ok',
    timelinePlan: '',
    timelineOption: 'optimistic',
    roles: [
      defaultRole({ roleType: 'EB', influence: 'high', support: -1 }),
      defaultRole({ roleType: 'UB', influence: 'medium', support: -1 }),
      defaultRole({ roleType: 'TB', influence: 'medium', support: -1 }),
      defaultRole({ roleType: 'COACH', influence: 'medium', support: -1 }),
    ],
    pricing: 'neutral',
    positioning: 5,
    reactionMode: 'EK',
    strategy: '',
    targets: [],
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

const emptyCalc: CalcIntermediate = {
  vetoed: false, baseSupportScore: 0, rolePenalty: 1,
  reactionFactor: 1, pricingAdjustment: 0, budgetPenalty: 0,
  timelinePenalty: 0, midRate: 0, finalRate: 0,
  missingEB: false, missingCoach: false,
};

/* ─── 子组件：三角形数字增减 ─── */
const TriangleNumberCell: React.FC<{
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number;
  getColor?: (v: number) => string;
}> = ({ value, onChange, min, max, step = 1, getColor }) => {
  const c = getColor ? getColor(value) : COLORS.textDark;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span style={{
        fontSize: 13, fontWeight: 600, color: c,
        minWidth: 18, textAlign: 'center',
      }}>{value}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
        <span onClick={() => onChange(Math.min(max, value + step))}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, display: 'block', userSelect: 'none' }}>▲</span>
        <span onClick={() => onChange(Math.max(min, value - step))}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, display: 'block', userSelect: 'none' }}>▼</span>
      </div>
    </div>
  );
};

/* ─── 子组件：影响力三角形循环 ─── */
const TriangleInfluenceCell: React.FC<{
  value: InfluenceLevel; weight: number;
  onInfluence: (v: InfluenceLevel) => void;
}> = ({ value, weight, onInfluence }) => {
  const levels: InfluenceLevel[] = ['low', 'medium', 'high'];
  const curIdx = levels.indexOf(value);
  const label = value === 'high' ? '高' : value === 'medium' ? '中' : '低';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textDark, lineHeight: 1.2 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.chartGray, lineHeight: 1.2 }}>{weight}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
        <span onClick={() => onInfluence(levels[(curIdx + 1) % 3])}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, display: 'block', userSelect: 'none' }}>▲</span>
        <span onClick={() => onInfluence(levels[(curIdx + 2) % 3])}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, display: 'block', userSelect: 'none' }}>▼</span>
      </div>
    </div>
  );
};


/* ─── 子组件：项目定位三角形循环 ─── */
const TrianglePositioningCell: React.FC<{
  value: number; onChange: (v: number) => void;
}> = ({ value, onChange }) => {
  const label = POSITIONING_LABELS[value - 1];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: COLORS.bgLight, borderRadius: 4, padding: '2px 6px' }}>
      <Tooltip title={`${value} - ${POSITIONING_EXPLANATIONS[value] || ''}`}
        overlayStyle={{ minWidth: 260 }} color="#fff" rootClassName="bt-tooltip">
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, cursor: 'help' }}>
          {label}（{value}）
        </span>
      </Tooltip>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
        <span onClick={() => onChange(value >= 10 ? 1 : value + 1)}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, userSelect: 'none' }}>▲</span>
        <span onClick={() => onChange(value <= 1 ? 10 : value - 1)}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, userSelect: 'none' }}>▼</span>
      </div>
    </div>
  );
};

/* ─── 子组件：反应模式三角形循环 ─── */
const REACTION_MODES: ReactionMode[] = ['G', 'T', 'EK', 'OC'];
const TriangleReactionCell: React.FC<{
  value: ReactionMode; onChange: (v: ReactionMode) => void;
}> = ({ value, onChange }) => {
  const curIdx = REACTION_MODES.indexOf(value);
  const info = REACTION_EXPLANATIONS[value];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: COLORS.bgLight, borderRadius: 4, padding: '2px 6px' }}>
      <Tooltip title={`${info?.desc || ''} | 策略：${info?.strategy || ''}`}
        overlayStyle={{ minWidth: 280 }} color="#fff" rootClassName="bt-tooltip">
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark, cursor: 'help' }}>
          {REACTION_LABELS[value]}
        </span>
      </Tooltip>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
        <span onClick={() => onChange(REACTION_MODES[(curIdx + 1) % 4])}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, userSelect: 'none' }}>▲</span>
        <span onClick={() => onChange(REACTION_MODES[(curIdx + 3) % 4])}
          style={{ cursor: 'pointer', color: '#999', fontSize: 9, lineHeight: 1, height: 12, userSelect: 'none' }}>▼</span>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════ *
 *  主组件                                          *
 * ═══════════════════════════════════════════════ */

const BlueTableModal: React.FC<BlueTableModalProps> = ({ open, opportunity, onSave, onClose }) => {
  const [bt, setBt] = useState<BlueTable>(createEmptyBlueTable());
  const [calc, setCalc] = useState<CalcIntermediate>(emptyCalc);
  const [msg, ctx] = message.useMessage();

  // 初始化
  useEffect(() => {
    if (!open) return;
    const src = opportunity?.blueTable;
    if (src) {
      // 加载时按角色类型重新计算权重（修复残值）
      const bt = { ...src, roles: src.roles.map(r => ({ ...r, influenceWeight: getDefaultWeight(r.roleType, r.influence) })) };
      setBt(bt);
    } else {
      setBt(createEmptyBlueTable());
    }
  }, [open, opportunity?.id]);

  // 重新计算
  useEffect(() => { setCalc(calcBlueTableWinRate(bt)); }, [bt]);

  // ── 角色操作 ──
  const updateRole = useCallback((roleId: string, updates: Partial<BlueTableRole>) => {
    setBt(prev => ({ ...prev, roles: prev.roles.map(r => r.id === roleId ? { ...r, ...updates } : r) }));
  }, []);
  const addRole = useCallback(() => setBt(prev => ({ ...prev, roles: [...prev.roles, defaultRole()] })), []);
  const removeRole = useCallback((roleId: string) => setBt(prev => ({ ...prev, roles: prev.roles.filter(r => r.id !== roleId) })), []);

  // ── 提升目标 ──
  const addTarget = useCallback(() => setBt(prev => ({ ...prev, targets: [...prev.targets, { roleId: '', targetSupport: 0, plan: '' }] })), []);
  const updateTarget = useCallback((idx: number, u: Partial<{ roleId: string; targetSupport: number; plan?: string }>) => {
    setBt(prev => {
      const tgts = [...prev.targets]; tgts[idx] = { ...tgts[idx], ...u }; return { ...prev, targets: tgts };
    });
  }, []);
  const removeTarget = useCallback((idx: number) => setBt(prev => ({ ...prev, targets: prev.targets.filter((_, i) => i !== idx) })), []);

  // ── 保存 ──
  const handleSave = useCallback(() => onSave({ ...bt, updatedAt: new Date().toISOString().slice(0, 10) }), [bt, onSave]);

  // ── 清空 ──
  const handleClear = useCallback(() => {
    setBt(createEmptyBlueTable());
  }, []);

  // ── 否决预算 ──
  // ── 否决预算 ──
  const handleBudget = useCallback((v: VetoBudgetOption) => {
    setBt(prev => ({ ...prev, vetoBudget: v }));
  }, []);

  // ── 否决时间 ──
  const handleTimeline = useCallback((v: TimelineOption) => {
    setBt(prev => ({ ...prev, timelineOption: v }));
  }, []);

  const isVetoed = bt.vetoBudget === 'failed' || bt.timelineOption === 'negative';

  // ── 完整度 ──
  const completeness = useMemo(() => {
    const ok = [
      bt.roles.some(r => r.roleType === 'EB'),
      bt.roles.some(r => r.roleType === 'COACH'),
      bt.roles.every(r => r.support !== -1),
      bt.targets.some(t => (t.plan || '').trim().length > 0),
      bt.targets.length > 0,
    ];
    return { count: ok.filter(Boolean).length, total: ok.length, items: ok };
  }, [bt]);

  // ── 角色矩阵列 ──
  const onCellLock = (w: number) => () => ({ style: { width: w, minWidth: w, maxWidth: w, textAlign: 'center' as const } });

  const roleColumns: ColumnsType<BlueTableRole & { _idx: number }> = useMemo(() => [
    {
      title: '角色类型', width: 86, align: 'center', onCell: onCellLock(86),
      render: (_: unknown, rec: BlueTableRole) => (
        <select value={rec.roleType}
          onChange={e => {
            const newType = e.target.value as RoleType;
            const newWeight = getDefaultWeight(newType, rec.influence);
            updateRole(rec.id, { roleType: newType, influenceWeight: newWeight });
          }}
          style={{ ...selStyle, width: 78, textAlign: 'center' }}>
          {(['EB', 'UB', 'TB', 'COACH'] as const).map(rt => (
            <option key={rt} value={rt}>{ROLE_LABELS[rt]}</option>
          ))}
        </select>
      ),
    },
    {
      title: '姓名', width: 64, align: 'center', onCell: onCellLock(64),
      render: (_: unknown, rec: BlueTableRole) => (
        <input type="text" value={rec.name || ''}
          onChange={e => updateRole(rec.id, { name: e.target.value })}
          placeholder="—" style={{ ...cellInput, textAlign: 'center', color: COLORS.chartGray }} />
      ),
    },
    {
      title: '影响力', width: 96, align: 'center', onCell: onCellLock(96),
      render: (_: unknown, rec: BlueTableRole) => (
        <TriangleInfluenceCell value={rec.influence} weight={rec.influenceWeight}
          onInfluence={v => updateRole(rec.id, { influence: v, influenceWeight: getDefaultWeight(rec.roleType, v) })} />
      ),
    },
    {
      title: '支持度', width: 64, align: 'center', onCell: onCellLock(64),
      render: (_: unknown, rec: BlueTableRole) => (
        <TriangleNumberCell value={rec.support} onChange={v => updateRole(rec.id, { support: v })}
          min={-5} max={5}
          getColor={v => v <= -3 ? COLORS.danger : v <= 0 ? '#888' : COLORS.success} />
      ),
    },
    {
      title: '需求', width: 52, align: 'center', onCell: onCellLock(52),
      render: (_: unknown, rec: BlueTableRole) => (
        <TriangleNumberCell value={rec.demandFit} onChange={v => updateRole(rec.id, { demandFit: v })}
          min={1} max={5}
          getColor={v => v <= 2 ? COLORS.danger : v === 3 ? '#888' : COLORS.success} />
      ),
    },
    {
      title: '关系', width: 52, align: 'center', onCell: onCellLock(52),
      render: (_: unknown, rec: BlueTableRole) => (
        <TriangleNumberCell value={rec.relationship} onChange={v => updateRole(rec.id, { relationship: v })}
          min={1} max={5}
          getColor={v => v <= 2 ? COLORS.danger : v === 3 ? '#888' : COLORS.success} />
      ),
    },
    {
      title: '', width: 26, align: 'center', onCell: onCellLock(26),
      render: (_: unknown, rec: BlueTableRole) => (
        <span onClick={() => removeRole(rec.id)}
          style={{ cursor: 'pointer', color: COLORS.danger, fontSize: 15, opacity: 0.5 }}>×</span>
      ),
    },
  ], [updateRole, removeRole]);

  const roleDataSource = useMemo(() =>
    bt.roles.map((r, i) => ({ ...r, key: r.id, _idx: i })),
    [bt.roles]
  );

  // ── 通用样式 ──
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', letterSpacing: 0.2,
  };
  const groupHeader: React.CSSProperties = {
    padding: '7px 14px', fontSize: 14, fontWeight: 600, color: COLORS.textDark,
    background: COLORS.bgLight, borderBottom: `1px solid ${COLORS.border}`,
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    letterSpacing: 0.3,
  };
  const groupBody: React.CSSProperties = {
    padding: '10px 14px', background: '#fff',
  };

  return (
    <Modal
      title={<span style={{ fontSize: 18, fontWeight: 700, color: COLORS.textDark, letterSpacing: 0.5 }}>销售蓝表</span>}
      open={open} onCancel={onClose} width={1220} destroyOnHidden style={{ top: 0 }} footer={null}
      styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif", fontSize: 14 } }}
    >
      {ctx}

      {/* ======== 独立卡片区块 ======== */}
        {/* ═══════ 1. 否决检查 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={groupHeader}>
            <span>⛔ 否决检查</span>
          </div>
          <div style={{ background: '#fff' }}>
            {/* 行 1：项目预算 */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.borderLight}` }}>
              <div style={{
                padding: '7px 12px', fontSize: 12, width: 80, flexShrink: 0,
                fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark,
              }}>项目预算</div>
              <div style={{
                flex: 1, padding: '7px 12px', background: '#fff', display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <input value={bt.budgetAmount ?? ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setBt(prev => ({ ...prev, budgetAmount: v ? parseInt(v, 10) : undefined }));
                  }}
                  placeholder="项目预算"
                  style={{
                    flex: 1, border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 13, padding: 0, margin: 0,
                  }} />
                {(() => {
                  const BUDGET_OPTS = [
                    { v: 'ok' as VetoBudgetOption, label: '充足' },
                    { v: 'possible' as VetoBudgetOption, label: '紧张' },
                    { v: 'failed' as VetoBudgetOption, label: '不足' },
                  ];
                  const curIdx = BUDGET_OPTS.findIndex(o => o.v === bt.vetoBudget);
                  return (
                    <span style={{ cursor: 'pointer', color: bt.vetoBudget === 'failed' ? COLORS.danger : COLORS.primary, fontSize: 13, userSelect: 'none', fontWeight: 600, whiteSpace: 'nowrap', background: COLORS.bgLight, padding: '2px 8px', borderRadius: 3 }}
                      onClick={() => {
                        const next = BUDGET_OPTS[(curIdx + 1) % BUDGET_OPTS.length];
                        handleBudget(next.v);
                      }}>
                      {BUDGET_OPTS[curIdx]?.label || '充足'} ▾
                    </span>
                  );
                })()}
              </div>
            </div>
            {/* 行 2：项目节点 */}
            <div style={{ display: 'flex' }}>
              <div style={{
                padding: '7px 12px', fontSize: 12, width: 80, flexShrink: 0,
                fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark,
              }}>项目节点</div>
              <div style={{
                flex: 1, padding: '7px 12px', background: '#fff', display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <input value={bt.timelinePlan}
                  onChange={e => setBt(prev => ({ ...prev, timelinePlan: e.target.value }))}
                  placeholder="项目节点"
                  style={{
                    flex: 1, border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 13, padding: 0, margin: 0,
                  }} />
                {(() => {
                  const TIMELINE_OPTS = [
                    { v: 'optimistic' as TimelineOption, label: '乐观', color: COLORS.success },
                    { v: 'neutral' as TimelineOption, label: '中性', color: '#888' },
                    { v: 'negative' as TimelineOption, label: '消极', color: COLORS.danger },
                  ];
                  const curIdx = TIMELINE_OPTS.findIndex(o => o.v === bt.timelineOption);
                  return (
                    <span style={{ cursor: 'pointer', color: TIMELINE_OPTS[curIdx]?.color || COLORS.primary, fontSize: 13, userSelect: 'none', fontWeight: 600, whiteSpace: 'nowrap', background: COLORS.bgLight, padding: '2px 8px', borderRadius: 3 }}
                      onClick={() => {
                        const next = TIMELINE_OPTS[(curIdx + 1) % TIMELINE_OPTS.length];
                        handleTimeline(next.v);
                      }}>
                      {TIMELINE_OPTS[curIdx]?.label || '乐观'} ▾
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ 2. 采购角色 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={groupHeader}>
            <span>👥 采购角色</span>
          </div>
          {bt.roles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: COLORS.chartGray, fontSize: 13 }}>
              请至少添加一个联系人
            </div>
          ) : (
            <div style={{ padding: '4px 0', background: '#fff' }}>
              <Table
                dataSource={roleDataSource}
                columns={roleColumns}
                pagination={false}
                size="small"
                bordered
                style={{ borderRadius: 0 }}
                rowClassName={(_, idx) => idx % 2 === 0 ? '' : 'bt-row-alt'}
              />
            </div>
          )}
          {/* 添加采购角色按钮 */}
          <div style={{ padding: '8px 8px', background: '#fff' }}>
            <Button icon={<PlusOutlined />} onClick={addRole}
              onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
              onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
              style={{
                width: '100%', height: 32, borderRadius: 6,
                border: `1.5px dashed ${COLORS.borderLight}`,
                color: COLORS.primary, fontSize: 12, fontWeight: 600,
                transition: 'all 0.2s',
              }}>
              添加采购角色
            </Button>
          </div>
        </div>

        {/* ═══════ 3. 价格竞争力 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={groupHeader}>
            <span>💰 价格竞争力</span>
          </div>
          <div style={{ ...groupBody, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['very_strong', 'strong', 'competitive', 'neutral', 'slightly_weak', 'weak', 'very_weak'] as PricingLevel[]).map(level => {
              const adj = PRICING_ADJUSTMENTS[level];
              const sel = bt.pricing === level;
              const pos = adj > 0;
              const neg = adj < 0;
              return (
                <span key={level} onClick={() => setBt(prev => ({ ...prev, pricing: level }))}
                  style={{
                    fontSize: 12, cursor: 'pointer', padding: '4px 10px', borderRadius: 12,
                    background: sel ? (pos ? '#e8f5e9' : neg ? '#ffebee' : '#e8e8e8') : '#f8f8f8',
                    color: sel ? (pos ? '#2e7d32' : neg ? COLORS.danger : COLORS.textPrimary) : COLORS.textSecondary,
                    border: `1px solid ${sel ? (pos ? '#4caf50' : neg ? '#ef5350' : COLORS.border) : COLORS.borderLight}`,
                    fontWeight: sel ? 700 : 400, transition: 'all 0.1s',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}
                >
                  {PRICING_LABELS[level]}
                  {adj !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: sel ? (pos ? '#2e7d32' : COLORS.danger) : '#bbb' }}>
                      {adj > 0 ? '+' : ''}{adj}%
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* ═══════ 4. 策略计划 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={groupHeader}>
            <span>
              📋 策略计划
              <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textLight, marginLeft: 8 }}>
                不参与赢率计算，用于指导下一步行动
              </span>
            </span>
          </div>
          <div style={groupBody}>
            {/* 定位 + 反应模式 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, borderBottom: `1px solid ${COLORS.borderLight}`, paddingBottom: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderRight: `1px solid ${COLORS.borderLight}`, paddingRight: 12 }}>
                <span style={labelStyle}>项目定位</span>
                <TrianglePositioningCell value={bt.positioning} onChange={v => setBt(prev => ({ ...prev, positioning: v }))} />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', paddingLeft: 12 }}>
                <span style={labelStyle}>反应模式</span>
                <TriangleReactionCell value={bt.reactionMode} onChange={v => setBt(prev => ({ ...prev, reactionMode: v }))} />
              </div>
            </div>

            {/* 提升目标 / 行动计划 子表 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <RiseOutlined style={{ fontSize: 16, color: COLORS.primary }} />
              </div>

              {bt.targets.length === 0 ? (
                <div style={{ fontSize: 12, color: COLORS.chartGray, padding: '8px 0', textAlign: 'center' }}>
                  暂无提升目标，请添加以明确客户关系工作的方向
                </div>
              ) : (
                <div style={{ border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, overflow: 'hidden' }}>
                  {/* 表头 */}
                  <div style={{
                    display: 'flex', background: COLORS.bgLight,
                    borderBottom: `1px solid ${COLORS.border}`,
                    fontSize: 12, fontWeight: 600, color: COLORS.textSecondary,
                  }}>
                    <div style={{ width: 90, padding: '5px 8px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>角色</div>
                    <div style={{ width: 70, padding: '5px 8px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>当前</div>
                    <div style={{ width: 80, padding: '5px 8px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>目标</div>
                    <div style={{ flex: 1, padding: '5px 10px' }}>行动计划</div>
                    <div style={{ width: 26, padding: '5px 0', textAlign: 'center' }}></div>
                  </div>
                  {/* 行 */}
                  {bt.targets.map((t, i) => {
                    const role = bt.roles.find(r => r.id === t.roleId);
                    return (
                      <div key={i} style={{
                        display: 'flex', borderBottom: i < bt.targets.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none',
                        alignItems: 'center',
                      }}>
                        {/* 角色 */}
                        <div style={{ width: 90, padding: '4px 4px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>
                          <select value={t.roleId}
                            onChange={e => updateTarget(i, { roleId: e.target.value })}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '1px 2px',
                              border: 'none', background: 'transparent', outline: 'none', color: COLORS.textDark,
                              cursor: 'pointer', textAlign: 'center', width: 82,
                            }}
                          >
                            <option value="">—</option>
                            {bt.roles.map(r => (
                              <option key={r.id} value={r.id}>
                                {r.name || ROLE_LABELS[r.roleType]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {/* 当前支持度 */}
                        <div style={{ width: 70, padding: '4px 8px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: (role?.support ?? 0) <= -3 ? COLORS.danger : (role?.support ?? 0) <= 0 ? '#888' : COLORS.success,
                          }}>
                            {role?.support ?? '-'}
                          </span>
                        </div>
                        {/* 目标支持度 */}
                        <div style={{ width: 80, padding: '4px 8px', textAlign: 'center', borderRight: `1px solid ${COLORS.borderLight}` }}>
                          <TriangleNumberCell value={t.targetSupport} onChange={v => updateTarget(i, { targetSupport: v })}
                            min={-5} max={5}
                            getColor={v => v <= -3 ? COLORS.danger : v <= 0 ? '#888' : COLORS.success} />
                        </div>
                        {/* 行动计划 */}
                        <div style={{ flex: 1, padding: '3px 8px' }}>
                          <textarea value={t.plan || ''}
                            onChange={e => updateTarget(i, { plan: e.target.value })}
                            placeholder="针对该角色的具体行动…"
                            rows={1}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              border: 'none', background: 'transparent', outline: 'none',
                              fontSize: 13, fontFamily: 'inherit', color: COLORS.textPrimary,
                              padding: '3px 0', margin: 0, resize: 'none',
                              overflow: 'hidden', minHeight: 24, lineHeight: 1.5,
                            }}
                          />
                        </div>
                        {/* 删除 */}
                        <div style={{ width: 26, textAlign: 'center' }}>
                          <span onClick={() => removeTarget(i)}
                            style={{ cursor: 'pointer', color: COLORS.danger, fontSize: 15, opacity: 0.5, padding: '4px 0' }}>×</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 添加提升目标按钮 */}
              <div style={{ padding: '8px 0' }}>
                <Button icon={<PlusOutlined />} onClick={addTarget}
                  onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
                  onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
                  style={{
                    width: '100%', height: 32, borderRadius: 6,
                    border: `1.5px dashed ${COLORS.borderLight}`,
                    color: COLORS.primary, fontSize: 12, fontWeight: 600,
                    transition: 'all 0.2s',
                  }}>
                  添加提升目标
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ 5. 计算结果 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <div style={groupHeader}>
            <span>📊 赢率计算</span>
          </div>
          <div style={{ ...groupBody, background: COLORS.bgLight }}>
            {isVetoed ? (
              <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 15, fontWeight: 700, color: COLORS.danger }}>
                ⛔ {bt.vetoBudget === 'failed' ? '预算严重不足' : '已放弃参与'}，赢率锁定 0%
              </div>
            ) : bt.roles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 13, color: COLORS.chartGray }}>
                请至少添加一个采购角色
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.8 }}>
                  <div>
                    基础支持度 <b>{calc.baseSupportScore.toFixed(1)}%</b>
                    {' × '}角色缺失 <b>{calc.rolePenalty.toFixed(2)}</b>
                    {' × '}反应模式 <b>{calc.reactionFactor.toFixed(1)}</b>
                    {' + '}价格竞争力{' '}
                    <b style={{ color: calc.pricingAdjustment > 0 ? COLORS.success : calc.pricingAdjustment < 0 ? COLORS.danger : COLORS.textDark }}>
                      {calc.pricingAdjustment >= 0 ? '+' : ''}{calc.pricingAdjustment}%
                    </b>
                    {' + '}项目预算{' '}
                    <b style={{ color: calc.budgetPenalty > 0 ? COLORS.warning : COLORS.textLight }}>
                      {calc.budgetPenalty > 0 ? '-5' : '-0'}%
                    </b>
                    {' + '}项目节点{' '}
                    <b style={{ color: calc.timelinePenalty > 0 ? COLORS.warning : COLORS.textLight }}>
                      {calc.timelinePenalty > 0 ? '-5' : '-0'}%
                    </b>
                    {' = '}
                    <b style={{ fontSize: 16, color: calc.finalRate >= 70 ? COLORS.success : calc.finalRate >= 40 ? COLORS.warning : COLORS.danger }}>
                      {calc.finalRate}%
                    </b>
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 70 }}>
                  <div style={{
                    fontSize: 36, fontWeight: 700, lineHeight: 1.1,
                    color: calc.finalRate >= 70 ? COLORS.success
                         : calc.finalRate >= 40 ? COLORS.warning
                         : COLORS.danger,
                  }}>
                    {calc.finalRate}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════ 6. 蓝表状态 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginTop: 16,
        }}>
          <div style={groupHeader}>
            <span>📋 蓝表状态</span>
          </div>
          <div style={{ ...groupBody, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { label: 'EB（决策者）', ok: completeness.items[0] },
              { label: 'Coach（教练）', ok: completeness.items[1] },
              { label: '支持度已评估', ok: completeness.items[2] },
              { label: '行动计划', ok: completeness.items[3] },
              { label: '提升目标', ok: completeness.items[4] },
            ].map((item, i) => (
              <span key={i} style={{
                fontSize: 12, display: 'inline-flex', alignItems: 'center',
                color: '#000',
                background: item.ok ? '#e8f5e9' : '#e3f2fd',
                padding: '3px 12px', borderRadius: 12,
              }}>
                {item.label}
              </span>
            ))}
          </div>
        </div>

      {/* 操作按钮行 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '8px 12px' }}>
        <Button type="text" icon={<DeleteOutlined />} onClick={handleClear}
          style={{ color: COLORS.danger, fontSize: 16, width: 36, height: 36, borderRadius: 3 }} />
        <Button type="text" icon={<CloseOutlined />} onClick={onClose}
          style={{ color: '#999', fontSize: 16, width: 36, height: 36, borderRadius: 3 }} />
        <Button type="text" icon={<CheckOutlined />} onClick={handleSave}
          style={{ color: COLORS.primary, fontSize: 16, width: 36, height: 36, borderRadius: 3 }} />
      </div>

        {/* ═══════ 7. 填写说明 ═══════ */}
        <div style={{
          borderRadius: 8, border: `1px solid ${COLORS.borderLight}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          marginTop: 16,
        }}>
          <div style={groupHeader}>
            <span>📖 填写说明</span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              {
                icon: '⛔', title: '否决检查',
                desc: '预算"不足"锁定 0%，"紧张"扣减 5%；节点"消极"锁定 0%，"中性"扣减 5%。',
              },
              {
                icon: '👥', title: '采购角色',
                desc: 'EB 决策者 · UB 使用者 · TB 技术把关 · Coach 教练（内部信息）。影响力等级决定权重（EB：高10/中5/低1，其他：高5/中3/低1）。需求/关系不进公式，用于对比支持度发现策略矛盾。',
              },
              {
                icon: '💰', title: '价格竞争力',
                desc: '7 档主观判断，在乘法链结果上做加法修正（+15% ~ -15%）。',
              },
              {
                icon: '📋', title: '策略计划',
                desc: '定位 1~10（我方感受）、反应模式 G/T/EK/OC（客户变革意愿，OC ×0.8），两者不进公式供策略参考。提升目标设定支持度目标，行动计划填写具体措施。',
              },
              {
                icon: '📊', title: '赢率公式',
                desc: '基础支持度 = Σ(支持度归一化 × 权重) / Σ(权重) × 100\n支持度归一化 = (支持度 + 5) / 10（-5→0，0→0.5，+5→1）\n赢率 = 基础支持度 × 角色缺失 × 反应模式 + 价格竞争力 + 项目预算 + 项目节点 → 封顶 90%\n角色缺失：缺 EB+Coach ×0.4，仅缺 EB ×0.5，仅缺 Coach ×0.85\n项目扣减：预算"紧张"-5%，节点"中性"-5%',
              },
            ].map(item => (
              <div key={item.title} style={{
                background: '#f5f6f8', borderRadius: 6, padding: '6px 12px',
              }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: COLORS.textDark }}>{item.icon} {item.title}</span>
                <div style={{ marginTop: 2, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* 行交替色注入 */}
      <style>{`
        .bt-row-alt { background: #f7f8fa !important; }
        .ant-table-tbody input[type=number]::-webkit-inner-spin-button,
        .ant-table-tbody input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        .bt-tooltip .ant-tooltip-inner {
          font-size: 12px; border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          color: #0d1b2a !important; padding: 6px 12px;
        }
        .bt-tri {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </Modal>
  );
};

const selStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, padding: '1px 2px',
  border: 'none', background: 'transparent', outline: 'none', color: COLORS.textDark, cursor: 'pointer',
};
const cellInput: React.CSSProperties = {
  border: 'none', background: 'transparent', outline: 'none',
  fontSize: 13, fontFamily: 'inherit', width: '100%',
};

export default BlueTableModal;
