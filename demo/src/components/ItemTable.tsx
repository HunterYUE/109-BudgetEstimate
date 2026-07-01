import React, { useMemo } from 'react';
import { Table, Checkbox, Tag, Select, Tooltip, Button, ConfigProvider } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { GroupItem, SourcingType, GroupType } from '../types';
import { mockComponentDB } from '../mockData';
import { calcDirectCost, calcItemPrices } from '../utils/calculations';
import { COLORS } from '../styles/constants';

interface Props {
  items: GroupItem[];
  onItemsChange: (items: GroupItem[]) => void;
  onDeleteItem: (itemId: string) => void;
  groupType: GroupType;
  editing?: boolean;
}

function getColumnConfig(groupType: GroupType) {
  const isEquip = groupType === 'EQUIPMENT';
  const isInteg = groupType === 'INTEGRATION';
  const isImplExp = groupType === 'IMPLEMENTATION_EXPENSE';
  return {
    showType: isEquip || isInteg,
    showSourcing: isEquip || isInteg,
    showDesign: isEquip || isInteg,
    showAssembly: isEquip || isInteg,
    showWarranty: isEquip || isInteg,
    hideQty: isImplExp,
  };
}

const typeColors: Record<string, string> = {
  COMPLETE_SET: COLORS.primary, COMPONENT: '#008080', SOFTWARE: '#5a2d82', SERVICE: COLORS.success,
};


const EditableItemTable: React.FC<Props> = ({ items, onItemsChange, onDeleteItem, groupType, editing = true }) => {
  const cfg = getColumnConfig(groupType);

  const updateItem = (index: number, partial: Partial<GroupItem>) => {
    const newItems = [...items];
    const item = { ...newItems[index], ...partial };

    const directCost = calcDirectCost({
      unit_cost: item.unit_cost,
      qty_total: item.qty_total,
      design_hours: item.design_hours,
      design_hour_rate: item.design_hour_rate,
      assembly_hours: item.assembly_hours,
      assembly_hour_rate: item.assembly_hour_rate,
    });
    const prices = calcItemPrices(directCost, item.margin_rate);
    item.direct_cost = directCost;
    item.basic_price = prices.basic_price;
    item.accounting_price = prices.accounting_price;

    newItems[index] = item;
    onItemsChange(newItems);
  };

  const isInDB = (code: string) => mockComponentDB.some(c => c.code === code);

  // 解析版本号：从编码尾部匹配 -Vx.y
  const parseVersion = (code: string): { version: string; isTemp: boolean } | null => {
    const m = code.match(/-V(\d+\.\d+)$/);
    if (!m) return null;
    const major = parseInt(m[1], 10);
    return { version: 'V' + m[1], isTemp: major < 1 };
  };

  // Define columns with locked widths
  const onCellLock = (w: number) => () => ({ style: { width: w, minWidth: w, maxWidth: w } });

  const colSeq = {
    title: '序号', dataIndex: 'item_no', width: 44, align: 'center' as const,
    onCell: onCellLock(44),
    render: (v: number) => <span style={{ color: '#999' }}>{v}</span>,
  };

  const colType = cfg.showType ? [{
    title: '类型', dataIndex: 'item_type', width: 60, align: 'center' as const,
    onCell: onCellLock(60),
    render: (v: string, _: any, idx: number) => {
      const fontSize = 13;
      const TYPES = ['COMPLETE_SET', 'COMPONENT', 'SOFTWARE', 'SERVICE'];
      const LABELS = { COMPLETE_SET: 'CS', COMPONENT: 'CP', SOFTWARE: 'SW', SERVICE: 'SV' } as Record<string, string>;
      const typeLabel = LABELS[v] || v;
      const nextType = () => { const cur = TYPES.indexOf(v); return TYPES[(cur + 1) % TYPES.length]; };
      if (!editing) {
        return <span style={{
          fontSize,
          color: typeColors[v] || '#888', textAlign: 'center', display: 'block'
        }}>{typeLabel}</span>;
      }
      return (
        <span onClick={() => updateItem(idx, { item_type: nextType() as any })}
          style={{
            fontSize, cursor: 'pointer', display: 'block', textAlign: 'center',
            color: typeColors[v] || '#888', userSelect: 'none'
          }}
          title={'点击切换类型'}
        >{typeLabel}</span>
      );
    },
  }] : [];

  const colCode: ColumnsType<GroupItem> = [{
    title: '编码', dataIndex: 'code', width: 200,
    onCell: () => ({ style: { width: 200, minWidth: 200, maxWidth: 200 } }),
    render: (v: string, rec: GroupItem, idx: number) => {
      const matched = isInDB(v);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 13,
            color: matched ? (parseVersion(v)?.isTemp ? '#fa8c16' : COLORS.primary) : '#999'
          }}>{v}</span>
          {v && !matched && (
            <Tooltip title="此编码不在组件数据库中，请先注册">
              <span style={{ color: 'red', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>!</span>
            </Tooltip>
          )}
        </div>
      );
    },
  }];

  const colDesc: ColumnsType<GroupItem> = [{
    title: '描述', dataIndex: 'description', width: 280,
    onCell: onCellLock(280),
    render: (v: string) => {
      const display = v || '-';
      return (
        <Tooltip title={display} placement="topLeft">
          <span style={{ fontSize: 13, color: '#666', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        </Tooltip>
      );
    },
  }];

  const colSourcing: ColumnsType<GroupItem> = cfg.showSourcing ? [{
    title: '外购', dataIndex: 'sourcing_type', width: 52, align: 'center' as const,
    onCell: onCellLock(52),
    render: (v: SourcingType, _: any, idx: number) => editing ? (
      <Select size="small" variant="borderless" value={v}
        onChange={(val) => updateItem(idx, { sourcing_type: val })}
        style={{ width: 56, fontSize: 13 }}
        options={[
          { value: 'SELF_MANUFACTURED', label: '否' },
          { value: 'PURCHASED', label: '是' },
        ]}
      />
    ) : (
      <Tag color={v === 'PURCHASED' ? 'orange' : COLORS.success} style={{ margin: 0, fontSize: 13 }}>
        {v === 'PURCHASED' ? '是' : '否'}
      </Tag>
    ),
  }] : [];

  const colQty: ColumnsType<GroupItem> = cfg.hideQty ? [] : [{
    title: '数量', dataIndex: 'qty_total', width: 52, align: 'center' as const,
    onCell: onCellLock(52),
    render: (v: number, _: any, idx: number) => editing ? (
      <input type="number" min={0} value={v}
        onChange={(e) => updateItem(idx, { qty_total: parseInt(e.target.value) || 0 })}
        style={{ width: '100%', textAlign: 'center', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, MozAppearance: 'textfield' }} />
    ) : <span style={{ display: 'block', textAlign: 'center' }}>{v}</span>,
  }];

  const colCost: ColumnsType<GroupItem> = [{
    title: '单位成本', dataIndex: 'unit_cost', width: 96, align: 'right' as const,
    onCell: onCellLock(96),
    render: (v: number, _: any, idx: number) => <span>{'¥'}{Math.round(v).toLocaleString()}</span>,
  }];

  const colDesign: ColumnsType<GroupItem> = cfg.showDesign ? [{
    title: '设计工时', dataIndex: 'design_hours', width: 56, align: 'right' as const,
    onCell: onCellLock(56),
    render: (v: number) => <span style={{ display: 'block', textAlign: 'right' }}>{v}</span>,
  }] : [];

  const colAssembly: ColumnsType<GroupItem> = cfg.showAssembly ? [{
    title: '装配工时/台', dataIndex: 'assembly_hours', width: 76, align: 'right' as const,
    onCell: onCellLock(76),
    render: (v: number) => <span style={{ display: 'block', textAlign: 'right' }}>{v}</span>,
  }] : [];

  const colDC: ColumnsType<GroupItem> = [{
    title: '直接成本', dataIndex: 'direct_cost', width: 96, align: 'right' as const,
    onCell: onCellLock(96),
    render: (v: number) => <span style={{ fontWeight: 600 }}>{'¥'}{v.toLocaleString()}</span>,
  }];

  const colMargin: ColumnsType<GroupItem> = [{
    title: '毛利率', dataIndex: 'margin_rate', width: 55, align: 'center' as const,
    onCell: onCellLock(55),
    render: (v: number, _: any, idx: number) => editing ? (
      <input type="number" min={0} max={100} step={5} value={Math.round(v * 100)}
        onChange={(e) => updateItem(idx, { margin_rate: (parseInt(e.target.value) || 0) / 100 })}
        style={{ width: 60, textAlign: 'center', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, MozAppearance: 'textfield' }} />
    ) : <span style={{ display: 'block', textAlign: 'center' }}>{(v * 100).toFixed(0) + '%'}</span>,
  }];

  const colPrice: ColumnsType<GroupItem> = [{
    title: '预期售价', dataIndex: 'accounting_price', width: 105, align: 'right' as const,
    onCell: onCellLock(105),
    render: (v: number) => <span style={{ fontWeight: 600, color: COLORS.primary }}>{'¥'}{v.toLocaleString()}</span>,
  }];


  const colWarranty: ColumnsType<GroupItem> = cfg.showWarranty ? [{
    title: '质保', dataIndex: 'has_warranty', width: 44, align: 'center' as const,
    onCell: onCellLock(44),
    render: (v: boolean, _: any, idx: number) => editing ? (
      <ConfigProvider theme={{ components: { Checkbox: { colorPrimary: COLORS.primary } } }}>
        <Checkbox checked={v} onChange={(e) => updateItem(idx, { has_warranty: e.target.checked })} />
      </ConfigProvider>
    ) : v ? '✓' : '✗',
  }] : [];

  const colDelete: ColumnsType<GroupItem> = [{
    title: '', dataIndex: '_action', width: 32, align: 'center' as const,
    onCell: onCellLock(32),
    render: (_: any, rec: GroupItem) => editing ? (
      <Button type="text" size="small" danger icon={<DeleteOutlined />}
        onClick={() => onDeleteItem(rec.id)} style={{ padding: 0, fontSize: 14 }} />
    ) : null,
  }];

  const columns: ColumnsType<GroupItem> = [
    colSeq,
    ...colType,
    ...colCode,
    ...colDesc,
    ...colQty,
    ...colSourcing,
    ...colCost,
    ...colDesign,
    ...colAssembly,
    ...colDC,
    ...colMargin,
    ...colPrice,
    ...colWarranty,
    ...colDelete,
  ];

  return (
    <>
      <style>{`
        .ant-checkbox-checked .ant-checkbox-inner {
          background-color: COLORS.primary !important;
        }
        .ant-table-tbody .ant-select-selector .ant-select-selection-item,
        .ant-table-tbody .ant-select-item-option-content {

        }
        .ant-table-tbody .ant-tag {

          font-size: 13px !important;
        }
        .ant-table-tbody input[type=number]::-webkit-inner-spin-button,
        .ant-table-tbody input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        .ant-table-tbody input,
        .ant-table-tbody .ant-input-number-input {
          font-family: inherit !important;
          font-size: 13px !important;
        }
      `}</style>
      <Table
      dataSource={items.map((item, idx) => ({ ...item, key: item.id || idx }))}
      columns={columns}
      pagination={false}
      size="small"
      bordered
      scroll={{ x: 1300 }}
    />
    </>
  );
};

export default EditableItemTable;
