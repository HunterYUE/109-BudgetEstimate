import React, { useMemo } from 'react';
import { Table } from 'antd';
import type { Group } from '../types';
import { formatMoney } from '../utils/calculations';
import { COLORS } from '../styles/constants';

interface VersionData {
  warranty_rate: number;
  risk_rate: number;
  commercial_cost: number;
}

interface Props {
  groups: Group[];
  actualCosts: Record<string, number>;
  onActualCostChange?: (itemId: string, value: number) => void;
  locked?: boolean;
  version?: VersionData;
}

const RATES = { design: 174, assembly: 70 };

interface FlatRow {
  key: string;
  _type: 'header' | 'item';
  category: string;   // 成本类别
  code: string;       // 编码/名称（成本类别列显示）
  detail: string;     // 描述（描述列显示）
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
      if (g.group_type !== 'EQUIPMENT') continue;
      let hdrEst = 0, hdrAct = 0;
      const subRows: FlatRow[] = [];
      for (const item of g.items) {
        const mat = Math.round(item.unit_cost * item.qty_total);
        const act = actualCosts[item.id] ?? 0;
        hdrEst += mat;
        hdrAct += act;
        subRows.push({
          key: item.id,
          _type: 'item',
          category: g.name,
          code: item.code || '—',
          detail: item.description || '—',
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
    const integGroup = groups.find(g => g.group_type === 'INTEGRATION');
    if (integGroup) {
      let hdrEst = 0, hdrAct = 0;
      const subRows: FlatRow[] = [];
      for (const item of integGroup.items) {
        const mat = Math.round(item.unit_cost * item.qty_total);
        const act = actualCosts[item.id] ?? 0;
        hdrEst += mat;
        hdrAct += act;
        subRows.push({
          key: item.id,
          _type: 'item',
          category: '集成开发',
          code: item.code || '—',
          detail: item.description || '—',
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
    let designLaborAct = actualCosts['_labor:design'] ?? 0;
    for (const g of groups) {
      if (g.group_type === 'EQUIPMENT' || g.group_type === 'INTEGRATION') {
        for (const item of g.items) {
          designLaborEst += Math.round((item.design_hours || 0) * (item.design_hour_rate || RATES.design));
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
    let assemblyLaborAct = actualCosts['_labor:assembly'] ?? 0;
    for (const g of groups) {
      if (g.group_type === 'EQUIPMENT' || g.group_type === 'INTEGRATION') {
        for (const item of g.items) {
          assemblyLaborEst += Math.round((item.assembly_hours || 0) * (item.assembly_hour_rate || RATES.assembly) * item.qty_total);
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
    const deliveryGroup = groups.find(g => g.group_type === 'PROJECT_DELIVERY');
    if (deliveryGroup) {
      for (const item of deliveryGroup.items) {
        const act = actualCosts[item.id] ?? 0;
        laborEst += item.direct_cost;
        laborAct += act;
        laborSubRows.push({
          key: item.id,
          _type: 'item',
          category: '人工成本',
          code: item.code || '—',
          detail: item.description || '—',
          estimated: item.direct_cost,
          actual: act,
          variance: act - item.direct_cost,
          varianceRate: item.direct_cost > 0 ? (act - item.direct_cost) / item.direct_cost : 0,
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
      if (g.group_type === 'PACKAGING_TRANSPORT' || g.group_type === 'IMPLEMENTATION_EXPENSE' || g.group_type === 'OTHER') {
        for (const item of g.items) {
          const act = actualCosts[item.id] ?? 0;
          expenseEst += item.direct_cost;
          expenseAct += act;
          expenseSubRows.push({
            key: item.id,
            _type: 'item',
            category: '项目费用',
            code: item.code || '—',
            detail: item.description || '—',
            estimated: item.direct_cost,
            actual: act,
            variance: act - item.direct_cost,
            varianceRate: item.direct_cost > 0 ? (act - item.direct_cost) / item.direct_cost : 0,
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
    if (version && version.risk_rate > 0) {
      const totalDirectCost = groups.reduce((s, g) => s + g.items.reduce((si, i) => si + i.direct_cost, 0), 0);
      const riskEst = Math.round(totalDirectCost * version.risk_rate);
      const riskAct = actualCosts['_risk'] ?? 0;

      // Header
      result.push({
        key: 'h-risk',
        _type: 'header',
        category: '风险费用',
        code: '',
        detail: '',
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
        estimated: riskEst,
        actual: riskAct,
        variance: riskAct - riskEst,
        varianceRate: riskEst > 0 ? (riskAct - riskEst) / riskEst : 0,
        _relatedIds: ['_risk'],
        _isRiskItem: true,
      });
    }

    // ===== 6. Warranty cost (not editable, always incurred) =====
    if (version && version.warranty_rate > 0) {
      const warrantyBase = groups.reduce((s, g) =>
        s + g.items.filter(i => i.has_warranty).reduce((si, i) => si + Math.round(i.unit_cost * i.qty_total), 0), 0);
      const warrantyCost = Math.round(warrantyBase * version.warranty_rate);

      // Header
      result.push({
        key: 'h-warranty',
        _type: 'header',
        category: '质保费用',
        code: '',
        detail: '',
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
        detail: '质保成本已计入实际成本，项目执行中不可使用',
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
  }, [rows, version]);

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
      title: '成本类别', width: 150,
      render: (_: any, rec: FlatRow) => {
        if (rec._type === 'header') {
          const isEquip = !['集成开发', '人工成本', '项目费用', '风险费用', '质保费用'].includes(rec.category);
          return (
            <span style={{ color: isEquip ? COLORS.primary : '#333', fontWeight: 700, fontSize: 13 }}>
              {rec.category}
            </span>
          );
        }
        const isComputed = rec.key.startsWith('_labor:');
        return (
          <span style={{
            paddingLeft: 16, fontSize: 13,
            color: isComputed ? '#666' : '#333',
            fontStyle: isComputed ? 'italic' : 'normal',
          }}>
            {rec.code}
          </span>
        );
      },
    },
    {
      title: '描述', width: 240,
      render: (_: any, rec: FlatRow) => {
        if (rec._type === 'header') return null;
        const isRisk = rec._isRiskItem;
        const isWarr = rec._warrantyItem;
        return (
          <span style={{ fontSize: 13, color: isRisk ? '#e65100' : isWarr ? '#999' : '#666' }}>
            {rec.detail}

          </span>
        );
      },
    },
    {
      title: '概算成本', width: 120, align: 'right' as const,
      render: (_: any, rec: FlatRow) => (
        <span style={{ fontWeight: rec._type === 'header' ? 700 : 600, fontSize: 13 }}>
          ¥{formatMoney(rec.estimated)}
        </span>
      ),
    },
    {
      title: '实际成本', width: 140, align: 'right' as const,
      render: (_: any, rec: FlatRow) => {
        if (rec._type === 'header') {
          return <span style={{ fontWeight: 700, fontSize: 13 }}>¥{formatMoney(rec.actual)}</span>;
        }
        if (locked) {
          return <span style={{ fontWeight: 600, fontSize: 13 }}>¥{formatMoney(rec.actual)}</span>;
        }
        return (
          <input type="number" min={0}
            value={rec.actual || ''}
            onChange={e => handleActualChange(rec, parseFloat(e.target.value) || 0)}
            style={{
              width: '100%', textAlign: 'right', border: 'none', background: 'transparent',
              outline: 'none', fontSize: 13, MozAppearance: 'textfield',
            }}
          />
        );
      },
    },
    {
      title: '偏差额', width: 110, align: 'right' as const,
      render: (_: any, rec: FlatRow) => {
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
      render: (_: any, rec: FlatRow) => {
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
      <Table
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 850 }}
        onRow={rec => ({
          style: rec._type === 'header'
            ? { background: '#fafafa' }
            : rec._warrantyItem ? { background: '#f5f5f5', color: '#999' } : {},
        })}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              <Table.Summary.Cell index={0}><strong style={{ fontSize: 13 }}>合计</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2} align="right">
                <strong style={{ fontSize: 14 }}>¥{formatMoney(totals.estimated)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <strong style={{ fontSize: 14 }}>¥{formatMoney(totals.actual)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <strong style={{ fontSize: 14, color: totals.variance <= 0 ? COLORS.success : COLORS.danger }}>
                  {totals.variance >= 0 ? '+' : ''}¥{formatMoney(totals.variance)}
                </strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <strong style={{ fontSize: 14, color: totals.variance <= 0 ? COLORS.success : COLORS.danger }}>
                  {totals.rate >= 0 ? '+' : ''}{(totals.rate * 100).toFixed(1)}%
                </strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </>
  );
};

export default ItemCostTable;
