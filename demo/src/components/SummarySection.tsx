import React from 'react';
import { Card, Row, Col } from 'antd';
import type { Group, ProjectVersion } from '../types';
import { calcProjectSummary, formatMoney } from '../utils/calculations';
import { COLORS } from '../styles/constants';

interface Props {
  groups: Group[];
  version: ProjectVersion;
  onDiscountChange: (value: number) => void;
  onVersionUpdate?: (field: string, value: number) => void;
}

const WARNS = Array.from({ length: 11 }, (_, i) => i);

function calcCostBreakdown(groups: Group[]): { materialCost: number; laborCost: number; projectExpense: number } {
  let materialCost = 0;
  let laborCost = 0;
  let projectExpense = 0;
  const RATES = { design: 174, assembly: 70 };

  for (const g of groups) {
    for (const item of g.items) {
      const mat = Math.round(item.unit_cost * item.qty_total);
      const lab = Math.round(
        (item.design_hours || 0) * (item.design_hour_rate || RATES.design) +
        (item.assembly_hours || 0) * (item.assembly_hour_rate || RATES.assembly) * item.qty_total
      );

      if (g.group_type === 'PROJECT_DELIVERY') {
        laborCost += mat + lab;
      } else if (g.group_type === 'PACKAGING_TRANSPORT' || g.group_type === 'IMPLEMENTATION_EXPENSE' || g.group_type === 'OTHER') {
        projectExpense += mat + lab;
      } else {
        if (mat > 0) materialCost += mat;
        if (lab > 0) laborCost += lab;
      }
    }
  }
  return { materialCost, laborCost, projectExpense };
}

/** 单个成本项卡片 */
const CostCard: React.FC<{ label: string; value: number; unit?: string; highlight?: boolean; accent?: string }> =
  ({ label, value, unit = '¥', highlight, accent }) => (
    <div style={{
      flex: 1, minWidth: 0, padding: '12px 16px',
      background: highlight ? `linear-gradient(135deg, ${COLORS.primary}, #003d7a)` : COLORS.bgLight,
      borderRadius: 8, border: `1px solid ${highlight ? 'transparent' : COLORS.borderLight}`,
    }}>
      <div style={{ fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : COLORS.textSecondary, marginBottom: 4, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{
        fontSize: highlight ? 20 : 18, fontWeight: 700,
        color: highlight ? '#fff' : (accent || COLORS.textDark),
        fontFamily: 'inherit', lineHeight: 1.2,
      }}>
        {unit}{formatMoney(value)}
      </div>
    </div>
  );

/** 行内可点击百分比 */
const PctBadge: React.FC<{ value: number; label: string; onClick: () => void }> =
  ({ value, label, onClick }) => (
    <span onClick={onClick} title="点击切换"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        cursor: 'pointer', padding: '2px 8px', borderRadius: 4,
        background: COLORS.bgSelected, color: COLORS.primary,
        fontSize: 12, fontWeight: 600, userSelect: 'none',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#dce6f5'}
      onMouseLeave={e => e.currentTarget.style.background = COLORS.bgSelected}
    >
      <span style={{ fontSize: 10, opacity: 0.6 }}>{label}</span>
      {value}%
    </span>
  );

const SummarySection: React.FC<Props> = ({ groups, version, onDiscountChange, onVersionUpdate }) => {
  const summary = calcProjectSummary(groups, version, version.discounted_price || undefined);
  const { materialCost, laborCost, projectExpense } = calcCostBreakdown(groups);
  const directCost = materialCost + laborCost + projectExpense;
  const warnPct = Math.round(version.warranty_rate * 100);
  const riskPct = Math.round(version.risk_rate * 100);

  return (
    <Card size="small"
      style={{
        marginTop: 16, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      {/* 标题 */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: COLORS.textDark,
        marginBottom: 20, letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          display: 'inline-block', width: 3, height: 18, borderRadius: 2,
          background: `linear-gradient(${COLORS.primary}, ${COLORS.purple})`,
        }} />
        概算汇总
      </div>

      {/* ── 成本构成卡片行 ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <CostCard label="物料成本" value={materialCost} />
        <CostCard label="人工成本" value={laborCost} />
        <CostCard label="项目费用" value={projectExpense} />
        <CostCard label="直接成本" value={directCost} highlight />
      </div>

      {/* ── 质保 & 商业费用 & 风险 ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {/* 质保 */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${COLORS.borderLight}`, background: COLORS.bgLight,
        }}>
          <span style={{ fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>质保</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.textDark }}>¥{formatMoney(summary.warranty_base)}</span>
          <span style={{ color: COLORS.textLight, fontSize: 12 }}>×</span>
          <PctBadge value={warnPct} label="系数"
            onClick={() => { const n = WARNS[(warnPct + 1) % WARNS.length]; onVersionUpdate?.('warranty_rate', n / 100); }} />
          <span style={{ color: COLORS.textLight, fontSize: 12 }}>=</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.primary, whiteSpace: 'nowrap' }}>
            ¥{formatMoney(summary.warranty_cost)}
          </span>
        </div>

        {/* 风险 */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${COLORS.borderLight}`, background: COLORS.bgLight,
        }}>
          <span style={{ fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>风险</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.textDark }}>¥{formatMoney(directCost)}</span>
          <span style={{ color: COLORS.textLight, fontSize: 12 }}>×</span>
          <PctBadge value={riskPct} label="系数"
            onClick={() => { const n = WARNS[(riskPct + 1) % WARNS.length]; onVersionUpdate?.('risk_rate', n / 100); }} />
          <span style={{ color: COLORS.textLight, fontSize: 12 }}>=</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.warning, whiteSpace: 'nowrap' }}>
            ¥{formatMoney(summary.risk_cost)}
          </span>
        </div>

        {/* 商业费用 */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${COLORS.borderLight}`, background: COLORS.bgLight,
        }}>
          <span style={{ fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>商业费用</span>
          <input type="number" min={0} value={version.commercial_cost}
            onChange={(e) => onVersionUpdate?.('commercial_cost', parseInt(e.target.value) || 0)}
            style={{
              flex: 1, minWidth: 60, maxWidth: 140, padding: '4px 8px',
              border: `1px solid ${COLORS.border}`, borderRadius: 4,
              fontSize: 14, fontWeight: 600, color: COLORS.textDark, outline: 'none', textAlign: 'right',
              background: '#fff', fontFamily: 'inherit',
            }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.textDark, whiteSpace: 'nowrap' }}>
            ¥{formatMoney(version.commercial_cost)}
          </span>
        </div>
      </div>

      {/* ── 三卡片：预期总价 / 折后报价 / 项目利润 ── */}
      <Row gutter={16}>
        <Col span={8}>
          <div style={{
            padding: '18px 20px', borderRadius: 10,
            border: `1px solid ${COLORS.borderLight}`,
            background: '#fff', height: '100%',
            transition: 'box-shadow 0.2s',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              预期总价 <span style={{ fontSize: 10, color: COLORS.textLight }}>(含税)</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: COLORS.primary, lineHeight: 1.2 }}>
              ¥{formatMoney(Math.round(summary.total_accounting_price * (1 + version.tax_rate)))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textSecondary }}>
              欧元 <span style={{ fontWeight: 600, color: COLORS.textDark }}>€{formatMoney(Math.round(summary.total_accounting_price / version.eur_rate))}</span>
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{
            padding: '18px 20px', borderRadius: 10,
            border: `1px solid ${COLORS.borderLight}`,
            background: '#fff', height: '100%',
            transition: 'box-shadow 0.2s',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              折后报价 <span style={{ fontSize: 10, color: COLORS.textLight }}>(含税)</span>
            </div>
            <input type="text" inputMode="numeric"
              defaultValue={String(Math.round(summary.discounted_price * (1 + version.tax_rate)))}
              onBlur={(e) => {
                const val = parseFloat(e.target.value.replace(/[^0-9]/g, '')) || 0;
                onDiscountChange(Math.round(val / (1 + version.tax_rate)));
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={{ fontWeight: 700, fontSize: 24, color: COLORS.textDark, lineHeight: 1.2,
                border: 'none', borderBottom: `2px dashed ${COLORS.borderLight}`, outline: 'none',
                width: '100%', background: 'transparent', fontFamily: 'inherit', padding: 0,
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <span style={{ color: COLORS.textSecondary }}>折扣率 </span>
              {Math.abs(summary.discount_rate) < 0.001 ? (
                <span style={{ fontWeight: 700, color: COLORS.textLight }}>—</span>
              ) : (
                <span style={{
                  fontWeight: 700,
                  color: summary.discount_rate > 0 ? '#f5222d' : COLORS.success,
                }}>
                  {summary.discount_rate > 0 ? '-' : '+'}{(summary.discount_rate * 100).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{
            padding: '18px 20px', borderRadius: 10,
            background: `linear-gradient(135deg, ${COLORS.primary}, #003d7a)`,
            height: '100%', color: '#fff',
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              项目利润 <span style={{ fontSize: 10 }}>(含税)</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, lineHeight: 1.2 }}>
              ¥{formatMoney(Math.round(summary.discounted_price * (1 + version.tax_rate) - summary.total_cost))}
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <span style={{ opacity: 0.7 }}>GP3 毛利率 </span>
              <TextGauge value={summary.gp3} />
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

const TextGauge: React.FC<{ value: number }> = ({ value }) => {
  const pct = (value * 100).toFixed(1);
  const color = value >= 0.2 ? '#4caf50' : value >= 0.1 ? '#ff9800' : '#f44336';
  return <span style={{ fontWeight: 700, color }}>{pct}%</span>;
};

export default SummarySection;
