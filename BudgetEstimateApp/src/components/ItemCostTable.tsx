import React, { useMemo } from 'react';
import { Table } from 'antd';
import type { Group } from '../types';
import { formatMoney } from '../utils/calculations';
import { COLORS } from '../styles/colors';

interface VersionData {
  warrantyRate: number;
  riskRate: number;
}

interface Props {
  groups: Group[];
  actualCosts: Record<string, number>;
  onActualCostChange?: (itemId: string, value: number) => void;
  locked?: boolean;
  version?: VersionData;
}

const RATES = { design: 175, assembly: 85 };

interface FlatRow {
  key: string;
  _type: 'header' | 'item';
  category: string;   // 成本类别
  code: string;       // 编码/名称（成本类别列显示）
  detail: string;     // 描述（描述列显示）
  qty: number;        // 数量
  estimated: number;
  actual: number;
  variance: number;
  varianceRate: number;
  _relatedIds: string[];
  _isRiskItem: boolean;
  _warrantyItem?: boolean;
}

const ItemCostTable: React.FC<Props> = ({ groups, actualCosts, onActualCostChange, locked, version }) => {
  const rows: FlatRow[] = useMemo(() => {
    const result: FlatRow[] = [];

    // ===== 1. Equipment groups (material portion) =====
    for (const g of groups) {
      if (g.groupType !== 'EQUIPMENT') continue;
      let hdrEst = 0, hdrAct = 0;
      const subRows: FlatRow[] = [];
      for (const item of g.items) {
        const mat = Math.round(item.unitCost * item.qtyTotal);
        const act = actualCosts[item.id] ?? 0;
        hdrEst += mat;
        hdrAct += act;
        subRows.push({
          key: item.id,
          _type: 'item',
          category: g.name,
          code: item.code || '—',
          detail: item.description || '—',
          qty: Math.round(item.qtyTotal || 1),
          estimated: mat,
          actual: act,
          variance: act - mat,
          varianceRate: mat > 0 ? (act - mat) / mat : 0,
          _relatedIds: [item.id],
          _isRiskItem: false,
        });
      }
      result.push({
        key: 'h-' + g.id,
        _type: 'header',
        category: g.name,
        code: '',
        detail: '',
        qty: 0,
        estimated: hdrEst,
        actual: hdrAct,
        variance: hdrAct - hdrEst,
        varianceRate: hdrEst > 0 ? (hdrAct - hdrEst) / hdrEst : 0,
        _relatedIds: subRows.map(r => r.key),
        _isRiskItem: false,
      });
      result.push(...subRows);
    }

    // ===== 2. Integration (material portion) =====
    const integGroup = groups.find(g => g.groupType === 'INTEGRATION');
    if (integGroup) {
      let hdrEst = 0, hdrAct = 0;
      const subRows: FlatRow[] = [];
      for (const item of integGroup.items) {
        const mat = Math.round(item.unitCost * item.qtyTotal);
        const act = actualCosts[item.id] ?? 0;
        hdrEst += mat;
        hdrAct += act;
        subRows.push({
          key: item.id,
          _type: 'item',
          category: '集成开发',
          code: item.code || '—',
          detail: item.description || '—',
          qty: Math.round(item.qtyTotal || 1),
          estimated: mat,
          actual: act,
          variance: act - mat,
          varianceRate: mat > 0 ? (act - mat) / mat : 0,
          _relatedIds: [item.id],
          _isRiskItem: false,
        });
      }
      result.push({
        key: 'h-integration',
        _type: 'header',
        category: '集成开发',
        code: '',
        detail: '',
        qty: 0,
        estimated: hdrEst,
        actual: hdrAct,
        variance: hdrAct - hdrEst,
        varianceRate: hdrEst > 0 ? (hdrAct - hdrEst) / hdrEst : 0,
        _relatedIds: subRows.map(r => r.key),
        _isRiskItem: false,
      });
      result.push(...subRows);
    }

    // ===== 3. Labor cost =====
    let laborEst = 0, laborAct = 0;
    const laborSubRows: FlatRow[] = [];

    // Computed: design hours (from EQUIPMENT + INTEGRATION)
    let designLaborEst = 0;
    const designLaborAct = actualCosts['_labor:design'] ?? 0;
    for (const g of groups) {
      if (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION') {
        for (const item of g.items) {
          designLaborEst += Math.round((item.designHours || 0) * (item.designHourRate || RATES.design));
        }
      }
    }
    if (designLaborEst > 0 || designLaborAct > 0) {
      const dv = designLaborAct - designLaborEst;
      laborSubRows.push({
        key: '_labor:design',
        _type: 'item',
        category: '人工成本',
        code: 'L-DESIGN-HRS',
        detail: '设计工时汇总',
        qty: 0,
        estimated: designLaborEst,
        actual: designLaborAct,
        variance: dv,
        varianceRate: designLaborEst > 0 ? dv / designLaborEst : 0,
        _relatedIds: ['_labor:design'],
        _isRiskItem: false,
      });
      laborEst += designLaborEst;
      laborAct += designLaborAct;
    }

    // Computed: assembly hours (from EQUIPMENT + INTEGRATION)
    let assemblyLaborEst = 0;
    const assemblyLaborAct = actualCosts['_labor:assembly'] ?? 0;
    for (const g of groups) {
      if (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION') {
        for (const item of g.items) {
          assemblyLaborEst += Math.round((item.assemblyHours || 0) * (item.assemblyHourRate || RATES.assembly) * item.qtyTotal);
        }
      }
    }
    if (assemblyLaborEst > 0 || assemblyLaborAct > 0) {
      const av = assemblyLaborAct - assemblyLaborEst;
      laborSubRows.push({
        key: '_labor:assembly',
        _type: 'item',
        category: '人工成本',
        code: 'L-ASSEMBLY-HRS',
        detail: '装配工时汇总',
        qty: 0,
        estimated: assemblyLaborEst,
        actual: assemblyLaborAct,
        variance: av,
        varianceRate: assemblyLaborEst > 0 ? av / assemblyLaborEst : 0,
        _relatedIds: ['_labor:assembly'],
        _isRiskItem: false,
      });
      laborEst += assemblyLaborEst;
      laborAct += assemblyLaborAct;
    }

    // Items from PROJECT_DELIVERY (pure labor services)
    const deliveryGroup = groups.find(g => g.groupType === 'PROJECT_DELIVERY');
    if (deliveryGroup) {
      for (const item of deliveryGroup.items) {
        const act = actualCosts[item.id] ?? 0;
        laborEst += item.directCost;
        laborAct += act;
        laborSubRows.push({
          key: item.id,
          _type: 'item',
          category: '人工成本',
          code: item.code || '—',
          detail: item.description || '—',
          qty: Math.round(item.qtyTotal || 1),
          estimated: item.directCost,
          actual: act,
          variance: act - item.directCost,
          varianceRate: item.directCost > 0 ? (act - item.directCost) / item.directCost : 0,
          _relatedIds: [item.id],
          _isRiskItem: false,
        });
      }
    }

    result.push({
      key: 'h-labor',
      _type: 'header',
      category: '人工成本',
      code: '',
      detail: '',
      estimated: laborEst,
      actual: laborAct,
      variance: laborAct - laborEst,
      varianceRate: laborEst > 0 ? (laborAct - laborEst) / laborEst : 0,
      _relatedIds: laborSubRows.map(r => r.key),
      _isRiskItem: false,
    });
    result.push(...laborSubRows);

    // ===== 4. Project expense =====
    let expenseEst = 0, expenseAct = 0;
    const expenseSubRows: FlatRow[] = [];
    for (const g of groups) {
      if (g.groupType === 'PACKAGING_TRANSPORT' || g.groupType === 'IMPLEMENTATION_EXPENSE' || g.groupType === 'OTHER') {
        for (const item of g.items) {
          const act = actualCosts[item.id] ?? 0;
          expenseEst += item.directCost;
          expenseAct += act;
          expenseSubRows.push({
            key: item.id,
            _type: 'item',
            category: '项目费用',
            code: item.code || '—',
            detail: item.description || '—',
            qty: Math.round(item.qtyTotal || 1),
            estimated: item.directCost,
            actual: act,
            variance: act - item.directCost,
            varianceRate: item.directCost > 0 ? (act - item.directCost) / item.directCost : 0,
            _relatedIds: [item.id],
            _isRiskItem: false,
          });
        }
      }
    }
    result.push({
      key: 'h-expense',
      _type: 'header',
      category: '项目费用',
      code: '',
      detail: '',
      estimated: expenseEst,
      actual: expenseAct,
      variance: expenseAct - expenseEst,
      varianceRate: expenseEst > 0 ? (expenseAct - expenseEst) / expenseEst : 0,
      _relatedIds: expenseSubRows.map(r => r.key),
      _isRiskItem: false,
    });
    result.push(...expenseSubRows);

    // ===== 5. Risk cost (major category, requires approval) =====
    if (version && version.riskRate > 0) {
      const totalDirectCost = groups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.directCost, 0), 0);
      const riskEst = Math.round(totalDirectCost * version.riskRate);
      const riskAct = actualCosts['_risk'] ?? 0;

      // Header
      result.push({
        key: 'h-risk',
        _type: 'header',
        category: '风险费用',
        code: '',
        detail: '',
        qty: 0,
        estimated: riskEst,
        actual: riskAct,
        variance: riskAct - riskEst,
        varianceRate: riskEst > 0 ? (riskAct - riskEst) / riskEst : 0,
        _relatedIds: ['_risk'],
        _isRiskItem: false,
      });
      // Sub-item
      result.push({
        key: '_risk',
        _type: 'item',
        category: '风险费用',
        code: 'R-RISK-COST-V1.0',
        detail: '项目风险费用审批后方可使用',
        qty: 0,
        estimated: riskEst,
        actual: riskAct,
        variance: riskAct - riskEst,
        varianceRate: riskEst > 0 ? (riskAct - riskEst) / riskEst : 0,
        _relatedIds: ['_risk'],
        _isRiskItem: true,
      });
    }

    // ===== 6. Warranty cost (not editable, always incurred) =====
    if (version && version.warrantyRate > 0) {
      // ⚠️ 质保基数仅统计 EQUIPMENT/INTEGRATION 组类型（与 calcProjectSummary 一致）
      const warrantyBase = groups.reduce((s, g) =>
        (g.groupType === 'EQUIPMENT' || g.groupType === 'INTEGRATION')
          ? s + g.items.filter(i => !i.hasWarranty).reduce((si, i) => si + i.directCost, 0)
          : s, 0);
      const warrantyCost = Math.round(warrantyBase * version.warrantyRate);

      // Header
      result.push({
        key: 'h-warranty',
        _type: 'header',
        category: '质保费用',
        code: '',
        detail: '',
        qty: 0,
        estimated: warrantyCost,
        actual: warrantyCost,
        variance: 0,
        varianceRate: 0,
        _relatedIds: [],
        _isRiskItem: false,
      });
      // Sub-item
      result.push({
        key: '_warranty',
        _type: 'item',
        category: '质保费用',
        code: 'W-WARRANTY',
        detail: '质保成本已计入实际成本',
        qty: 0,
        estimated: warrantyCost,
        actual: warrantyCost,
        variance: 0,
        varianceRate: 0,
        _relatedIds: [],
        _isRiskItem: false,
        _warrantyItem: true,
      });
    }

    return result;
  }, [groups, actualCosts, version]);

  // ---- Totals ----
  const totals = useMemo(() => {
    const allHeaders = rows.filter(r => r._type === 'header');
    const est = allHeaders.reduce((s, r) => s + r.estimated, 0);
    const act = allHeaders.reduce((s, r) => s + r.actual, 0);

    const varAmt = act - est;
    return { estimated: est, actual: act, variance: varAmt, rate: est > 0 ? varAmt / est : 0 };
  }, [rows]);

  const handleActualChange = (row: FlatRow, newVal: number) => {
    if (locked || !onActualCostChange) return;
    if (row._type === 'header' || row._warrantyItem) return;

    for (const id of row._relatedIds) {
      onActualCostChange(id, id === row._relatedIds[0] ? newVal : 0);
    }
  };

  // ---- Columns ----
  const columns = [
    {
      title: '成本类别', width: 120,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') {
          const isEquip = !['集成开发', '人工成本', '项目费用', '风险费用', '质保费用'].includes(rec.category);
          return (
            <span style={{ color: isEquip ? COLORS.primary : COLORS.textPrimary, fontWeight: 700, fontSize: 13 }}>
              {rec.category}
            </span>
          );
        }
        const isComputed = rec.key.startsWith('_labor:');
        return (
          <span style={{
            paddingLeft: 16, fontSize: 13,
            color: isComputed ? COLORS.textSecondary : COLORS.textPrimary,
            fontStyle: isComputed ? 'italic' : 'normal',
          }}>
            {rec.code}
          </span>
        );
      },
    },
    {
      title: '数量', width: 60, align: 'center' as const,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') return null;
        return (
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
            {rec.qty || '—'}
          </span>
        );
      },
    },
    {
      title: '描述', width: 210,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') return null;
        return (
          <span style={{ fontSize: 13, color: COLORS.primary }}>
            {rec.detail}

          </span>
        );
      },
    },
    {
      title: '概算成本', width: 120, align: 'right' as const,
      render: (_text: unknown, rec: FlatRow) => (
        <span style={{ fontWeight: rec._type === 'header' ? 700 : 600, fontSize: 13, color: COLORS.textSecondary }}>
          ¥{formatMoney(rec.estimated)}
        </span>
      ),
    },
    {
      title: '实际成本', width: 140, align: 'right' as const,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') {
          return <span style={{ fontWeight: 700, fontSize: 13, color: '#000' }}>¥{formatMoney(rec.actual)}</span>;
        }
        if (locked) {
          return <span style={{ fontWeight: 600, fontSize: 13, color: '#000' }}>¥{formatMoney(rec.actual)}</span>;
        }
        return (
          <input type="number" min={0}
            value={rec.actual ?? ''}
            onChange={e => handleActualChange(rec, parseFloat(e.target.value) || 0)}
            style={{
              width: '100%', height: '100%', minHeight: 28,
              border: `1px solid ${COLORS.border}`, borderRadius: 3,
              padding: '2px 8px', textAlign: 'right', fontSize: 13,
              fontWeight: 600, outline: 'none', boxSizing: 'border-box',
              MozAppearance: 'textfield',
            }}
          />
        );
      },
    },
    {
      title: '偏差额', width: 110, align: 'right' as const,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') return null;
        return (
          <span style={{ fontWeight: 600, fontSize: 13, color: rec.variance <= 0 ? COLORS.success : COLORS.danger }}>
            {rec.variance >= 0 ? '+' : ''}¥{formatMoney(rec.variance)}
          </span>
        );
      },
    },
    {
      title: '偏差率', width: 76, align: 'right' as const,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') return null;
        return (
          <span style={{ fontWeight: 600, fontSize: 13, color: rec.variance <= 0 ? COLORS.success : COLORS.danger }}>
            {rec.varianceRate >= 0 ? '+' : ''}{(rec.varianceRate * 100).toFixed(1)}%
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 900 }}
        onRow={rec => ({
          style: rec._type === 'header'
            ? { background: COLORS.bgLight }
            : rec._warrantyItem ? { background: COLORS.bgTag, color: COLORS.textLight } : {},
        })}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row style={{ background: COLORS.bgLight }}>
              <Table.Summary.Cell index={0}><strong style={{ fontSize: 13 }}>合计</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />  {/* 数量 */}
              <Table.Summary.Cell index={2} />  {/* 描述 */}
              <Table.Summary.Cell index={3} align="right">
                <strong style={{ fontSize: 14 }}>¥{formatMoney(totals.estimated)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <strong style={{ fontSize: 14 }}>¥{formatMoney(totals.actual)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <strong style={{ fontSize: 14, color: totals.variance <= 0 ? COLORS.success : COLORS.danger }}>
                  {totals.variance >= 0 ? '+' : ''}¥{formatMoney(totals.variance)}
                </strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                <strong style={{ fontSize: 14, color: totals.variance <= 0 ? COLORS.success : COLORS.danger }}>
                  {totals.rate >= 0 ? '+' : ''}{(totals.rate * 100).toFixed(1)}%
                </strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
      </div>
    </>
  );
};

export default ItemCostTable;
