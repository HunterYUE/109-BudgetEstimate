import React, { useMemo, useCallback } from 'react';
import { Table } from 'antd';
import type { Group } from '../types';
import { formatMoney } from '../utils/calculations';
import { buildCostLines, type CostLine } from '../utils/costBreakdown';
import { COLORS } from '../styles/colors';
import MoneyInput from './MoneyInput';

/** 非设备组的标准成本类别（成本类别列按此区分设备组高亮） */
const STANDARD_CATEGORIES = ['集成开发', '人工成本', '项目费用', '风险费用', '商业费用', '质保费用'];

interface VersionData {
  warrantyRate: number;
  riskRate: number;
  taxRate?: number;
  commercialCost?: number;
}

interface Props {
  groups: Group[];
  actualCosts: Record<string, number>;
  onActualCostChange?: (itemId: string, value: number) => void;
  locked?: boolean;
  version?: VersionData;
  laborRates?: { design: number; assembly: number };
}

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
  /** 实际成本写入键（仅 item 行使用；header 行聚合展示，无此字段） */
  _relatedIds?: string[];
  _warrantyItem?: boolean;
}

const ItemCostTable: React.FC<Props> = ({ groups, actualCosts, onActualCostChange, locked, version, laborRates }) => {
  const rows: FlatRow[] = useMemo(() => {
    // ⚠️ 成本分解单一来源 buildCostLines（与 handleExportCost 共享），此处仅做展示层包装
    const lines = buildCostLines(groups, actualCosts, version, laborRates);
    const result: FlatRow[] = [];
    let i = 0;
    while (i < lines.length) {
      // 按连续同类别行聚合为一个 header + 子行（顺序与 buildCostLines 一致）
      const category = lines[i].category;
      const group: CostLine[] = [];
      while (i < lines.length && lines[i].category === category) group.push(lines[i++]);
      const est = group.reduce((s, l) => s + l.estimated, 0);
      const act = group.reduce((s, l) => s + l.actual, 0);
      result.push({
        key: 'h-' + category,
        _type: 'header',
        category,
        code: '', detail: '', qty: 0,
        estimated: est, actual: act,
        variance: act - est,
        varianceRate: est > 0 ? (act - est) / est : 0,
      });
      for (const line of group) {
        result.push({
          key: line.key,
          _type: 'item',
          category: line.category,
          code: line.code,
          detail: line.detail,
          qty: line.qty,
          estimated: line.estimated,
          actual: line.actual,
          variance: line.actual - line.estimated,
          varianceRate: line.estimated > 0 ? (line.actual - line.estimated) / line.estimated : 0,
          _relatedIds: [line.key],
          _warrantyItem: line.readonly ? true : undefined,
        });
      }
    }
    return result;
  // ⚠️ laborRates 参与人工成本计算（design/assembly 费率兜底），必须列入依赖，否则物料库费率加载后人工区不重算
  }, [groups, actualCosts, version, laborRates]);

  // ---- Totals ----
  const totals = useMemo(() => {
    const allHeaders = rows.filter(r => r._type === 'header');
    const est = allHeaders.reduce((s, r) => s + r.estimated, 0);
    const act = allHeaders.reduce((s, r) => s + r.actual, 0);

    const varAmt = act - est;
    return { estimated: est, actual: act, variance: varAmt, rate: est > 0 ? varAmt / est : 0 };
  }, [rows]);

  const handleActualChange = useCallback((row: FlatRow, newVal: number) => {
    if (locked || !onActualCostChange) return;
    if (row._type === 'header' || row._warrantyItem) return;
    // 可编辑行的 _relatedIds 恒为单元素（item.id / _sv_design 等聚合键），无需循环
    const id = row._relatedIds?.[0];
    if (id) onActualCostChange(id, newVal);
  }, [locked, onActualCostChange]);

  // ---- Columns ----
  const columns = useMemo(() => [
    {
      title: '成本类别', width: 120,
      render: (_text: unknown, rec: FlatRow) => {
        if (rec._type === 'header') {
          const isEquip = !STANDARD_CATEGORIES.includes(rec.category);
          return (
            <span style={{ color: isEquip ? COLORS.primary : COLORS.textPrimary, fontWeight: 700, fontSize: 13 }}>
              {rec.category}
            </span>
          );
        }
        return (
          <span style={{
            paddingLeft: 16, fontSize: 13,
            color: COLORS.textPrimary,
            fontStyle: 'normal',
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
          return <span style={{ fontWeight: 700, fontSize: 13, color: '#000', display: 'block', textAlign: 'right', padding: '2px 4px' }}>¥{formatMoney(rec.actual)}</span>;
        }
        // ⚠️ 质保行不可编辑（handleActualChange 会拦截其写入），必须渲染为只读，否则输入被静默丢弃
        if (locked || !onActualCostChange || rec._warrantyItem) {
          return <span style={{ fontWeight: 600, fontSize: 13, color: '#000', display: 'block', textAlign: 'right', padding: '2px 4px' }}>¥{formatMoney(rec.actual)}</span>;
        }
        return <MoneyInput value={rec.actual} onCommit={v => handleActualChange(rec, v)} />;
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
  ], [locked, onActualCostChange, handleActualChange]);

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
