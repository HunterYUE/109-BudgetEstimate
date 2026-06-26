import React from 'react';
import { Card, Row, Col } from 'antd';
import type { Group, ProjectVersion } from '../types';
import { calcProjectSummary, formatMoney } from '../utils/calculations';

interface Props {
  groups: Group[];
  version: ProjectVersion;
  onDiscountChange: (value: number) => void;
  onVersionUpdate?: (field: string, value: any) => void;
}

const cellStyle: React.CSSProperties = {
  padding: '8px 14px', fontSize: 14, border: '1px solid #e8e8e8',
};
const labelStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap',
  color: '#1a2744',
};

const moneyStyle: React.CSSProperties = { fontWeight: 600, color: '#00509e' };
const WARNS = Array.from({ length: 11 }, (_, i) => i);

/** Calculate material cost and labor cost from groups */
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
        // Pure labor → labor cost
        laborCost += mat + lab;
      } else if (g.group_type === 'PACKAGING_TRANSPORT' || g.group_type === 'IMPLEMENTATION_EXPENSE' || g.group_type === 'OTHER') {
        // Project expense: packaging, travel/management, other
        projectExpense += mat + lab;
      } else {
        // Equipment / Integration: split
        if (mat > 0) materialCost += mat;
        if (lab > 0) laborCost += lab;
      }
    }
  }
  return { materialCost, laborCost, projectExpense };
}

const SummarySection: React.FC<Props> = ({ groups, version, onDiscountChange, onVersionUpdate }) => {
  const summary = calcProjectSummary(groups, version, version.discounted_price);
  const { materialCost, laborCost, projectExpense } = calcCostBreakdown(groups);
  const directCost = materialCost + laborCost + projectExpense;
  const warnPct = Math.round(version.warranty_rate * 100);
  const riskPct = Math.round(version.risk_rate * 100);

  return (
    <Card size="small" title={<span style={{ fontSize: 16 }}>概算汇总</span>}
      style={{ marginTop: 16, borderTop: '3px solid #00509e', background: '#d4c5f0', borderRadius: 4 }}>

      {/* 成本汇总 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <colgroup>
          <col width="100" /><col width="155" /><col width="90" /><col width="155" /><col width="90" /><col width="155" /><col width="90" /><col width="155" />
        </colgroup>
        <tbody>
          <tr>
            <td style={labelStyle}>物料成本</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(materialCost)}</span></td>
            <td style={labelStyle}>人工成本</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(laborCost)}</span></td>
            <td style={labelStyle}>项目费用</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(projectExpense)}</span></td>
            <td style={labelStyle}>直接成本</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(directCost)}</span></td>
          </tr>
          <tr>
            <td style={labelStyle}>质保基数</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(summary.warranty_base)}</span></td>
            <td style={labelStyle}>质保系数</td>
            <td style={cellStyle}>
              <span style={{ cursor: 'pointer', color: '#00509e', fontWeight: 600 }}
                onClick={() => { const n = WARNS[(warnPct + 1) % WARNS.length]; onVersionUpdate?.('warranty_rate', n / 100); }}
                title="点击切换">{warnPct}%</span>
            </td>
            <td colSpan={2} style={{ border: 'none' }}></td>
            <td style={labelStyle}>质保费用</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(summary.warranty_cost)}</span></td>
          </tr>
          <tr>
            <td style={labelStyle}>风险基数</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(directCost)}</span></td>
            <td style={labelStyle}>风险系数</td>
            <td style={cellStyle}>
              <span style={{ cursor: 'pointer', color: '#00509e', fontWeight: 600 }}
                onClick={() => { const n = WARNS[(riskPct + 1) % WARNS.length]; onVersionUpdate?.('risk_rate', n / 100); }}
                title="点击切换">{riskPct}%</span>
            </td>
            <td colSpan={2} style={{ border: 'none' }}></td>
            <td style={labelStyle}>风险费用</td>
            <td style={cellStyle}><span style={moneyStyle}>¥{formatMoney(summary.risk_cost)}</span></td>
          </tr>
          <tr>
            <td style={labelStyle}>全部成本合计</td>
            <td style={cellStyle} colSpan={7}><span style={{ fontWeight: 700, fontSize: 16 }}>¥{formatMoney(summary.total_cost)}</span></td>
          </tr>
        </tbody>
      </table>

      {/* 报价与折扣 */}
      <Row gutter={24}>
        <Col span={8}>
          <Card size="small" variant="outlined" style={{ height: 116, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#666', fontSize: 16, marginBottom: 4, textAlign: 'left' }}>预期总价</div>
            <div style={{ fontWeight: 600, fontSize: 22, color: '#00509e', textAlign: 'left', fontFamily: 'inherit' }}>¥{formatMoney(Math.round(summary.total_accounting_price * (1 + version.tax_rate)))}</div>
            <div style={{ marginTop: 8, textAlign: 'left', color: '#666' }}>欧元：<strong>€{formatMoney(Math.round(summary.total_accounting_price / version.eur_rate))}</strong></div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" variant="outlined" style={{ height: 116, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#666', fontSize: 16, marginBottom: 4, textAlign: 'left' }}>折后报价</div>
            <div style={{ fontWeight: 600, fontSize: 22, color: '#00509e', textAlign: 'left', fontFamily: 'inherit' }}
              contentEditable suppressContentEditableWarning
              onBlur={(e) => {
                const val = parseFloat(e.currentTarget.textContent?.replace(/[^0-9.-]/g, '')) || 0;
                onDiscountChange(val);
              }}>{'¥' + formatMoney(Math.round(summary.discounted_price * (1 + version.tax_rate)))}</div>
            <div style={{ marginTop: 8, color: summary.discount_rate > 0 ? '#f5222d' : '#1a6b3c', textAlign: 'left' }}>
              折扣率：<span style={{ fontWeight: 600 }}>
                {summary.discount_rate > 0 ? '-' : '+'}
                {(summary.discount_rate * 100).toFixed(2) + '%'}
              </span>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" variant="outlined" style={{ height: 116, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#666', fontSize: 16, marginBottom: 4, textAlign: 'left' }}>项目利润</div>
            <div style={{ fontWeight: 600, fontSize: 22, color: '#00509e', textAlign: 'left', fontFamily: 'inherit' }}>¥{formatMoney(Math.round(summary.discounted_price * (1 + version.tax_rate) - summary.total_cost))}</div>
            <div style={{ marginTop: 8, textAlign: 'left', color: '#666' }}>
              GP3 毛利率：<TextGauge value={summary.gp3} />
            </div>
          </Card>
        </Col>
      </Row>

    </Card>
  );
};

const TextGauge: React.FC<{ value: number }> = ({ value }) => {
  const pct = (value * 100).toFixed(1);
  const color = value >= 0.2 ? '#1a6b3c' : value >= 0.1 ? '#fa8c16' : '#f5222d';
  return <span style={{ fontWeight: 600, color }}>{pct}%</span>;
};

export default SummarySection;
