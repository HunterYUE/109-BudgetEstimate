import React, { useEffect } from 'react';
import { Table, Tooltip, Button, Input, Popover } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { GroupItem, SourcingType, GroupType, Component, ItemType } from '../types';
import { componentService } from '../services/componentService';
import { calcDirectCost, calcItemPrices } from '../utils/calculations';
import { COLORS } from '../styles/colors';
import { lockCellWidth, BARE_INPUT_STYLE } from '../utils/tableUtils';

// 组件目录缓存（模块级，避免重复加载）
let catalogCache: Component[] | null = null;
let catalogLoading = false;
const catalogWaiters: Array<(data: Component[]) => void> = [];

function loadCatalog(): Promise<Component[]> {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (catalogLoading) {
    return new Promise(resolve => { catalogWaiters.push(resolve); });
  }
  catalogLoading = true;
  // ⚠️ 传 limit:'1000'：物料目录是报价编码下拉唯一数据源，默认 100 会截断合法编码（与 QuotationPage 校验的 1000 条不一致）
  return componentService.list({ limit: '1000' }).then(data => {
    catalogCache = data || [];
    catalogLoading = false;
    catalogWaiters.forEach(r => r(catalogCache!));
    catalogWaiters.length = 0;
    return catalogCache!;
  }).catch(() => {
    catalogCache = [];
    catalogLoading = false;
    catalogWaiters.forEach(r => r([]));
    catalogWaiters.length = 0;
    return [];
  });
}

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
  COMPLETE_SET: COLORS.primary, COMPONENT: '#008080', SOFTWARE: COLORS.purple, SERVICE: COLORS.success, PART: "#8B4513",
};


/** 毛利率输入框：独立管理编辑状态，用户可自由输入 */
const MarginInput: React.FC<{ value: number; onCommit: (val: number) => void }> = ({ value, onCommit }) => {
  const [text, setText] = React.useState(String(Math.round(value * 100)));

  const commit = () => {
    const cleaned = text.replace(/\D/g, '');
    const val = parseInt(cleaned, 10);
    if (!isNaN(val)) {
      onCommit(val / 100);
    } else {
      setText(String(Math.round(value * 100)));
    }
  };

  return (
    <input type="text" inputMode="numeric" value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      style={{ width: 60, textAlign: 'center', ...BARE_INPUT_STYLE, fontSize: 13, MozAppearance: 'textfield' }}
    />
  );
};


/** 可编辑的编码单元格，支持模糊搜索物料编码、名称和标签 */
const CodeCell: React.FC<{ value: string; onSelect: (item: Component) => void }> = ({ value, onSelect }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [catalog, setCatalog] = React.useState<Component[]>([]);
  useEffect(() => { loadCatalog().then(setCatalog); }, []);
  const results = search.trim()
    ? catalog.filter((c: Component) => c.code?.toLowerCase().includes(search.toLowerCase()) || c.nameCn?.toLowerCase().includes(search.toLowerCase()) || (c.tags || []).some((t: string) => t.includes(search)))
    : [];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click" placement="bottomLeft"
      content={
        <div style={{ width: 300, maxHeight: 200, overflowY: 'auto' }}>
          <Input size="small" placeholder="搜索编码 / 名称 / 标签"
            value={search} onChange={e => setSearch(e.target.value)} autoFocus
            style={{ marginBottom: 4, fontSize: 12 }} />
          {results.length === 0 && search.trim() && (
            <div style={{ padding: '8px 4px', fontSize: 12, color: COLORS.textLight }}>无匹配物料，可继续手动输入</div>
          )}
          {results.slice(0, 20).map(item => (
            <div key={item.id} onClick={() => { onSelect(item); setOpen(false); setSearch(''); }}
              style={{ padding: '6px 8px', cursor: 'pointer', fontSize: 12, borderRadius: 4, borderBottom: '1px solid #f0f0f0' }}
              onMouseEnter={e => e.currentTarget.style.background = COLORS.bgSelected}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 600, color: COLORS.primary }}>{item.code}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 11 }}>{item.nameCn}</div>
            </div>
          ))}
        </div>
      }>
      <span style={{ cursor: 'pointer', display: 'block', minHeight: 22 }}>
        {value ? <span style={{ fontSize: 13, color: COLORS.primary }}>{value}</span> : <span style={{ color: COLORS.textLight }}>点击选择编码</span>}
      </span>
    </Popover>
  );
};

const EditableItemTable: React.FC<Props> = ({ items, onItemsChange, onDeleteItem, groupType, editing = true }) => {
  const [catalog, setCatalog] = React.useState<Component[]>([]);
  const cfg = getColumnConfig(groupType);

  useEffect(() => { loadCatalog().then(setCatalog); }, []);

  const updateItem = (index: number, partial: Partial<GroupItem>) => {
    const newItems = [...items];
    const item = { ...newItems[index], ...partial };

    // 确保工时费率有值：所有人工服务必须有时费率，0 表示缺失（历史数据可能为 0），统一补默认/目录费率
    const effectiveDesignRate = item.designHourRate || catalog.find((c: Component) => c.code === 'SV-DESIGN-000000-V1.0')?.unitCost || 175;
    const effectiveAssemblyRate = item.assemblyHourRate || catalog.find((c: Component) => c.code === 'SV-INSASS-000000-V1.0')?.unitCost || 85;
    if (!item.designHourRate) item.designHourRate = effectiveDesignRate;
    if (!item.assemblyHourRate) item.assemblyHourRate = effectiveAssemblyRate;

    const directCost = calcDirectCost({
      unitCost: item.unitCost,
      qtyTotal: item.qtyTotal,
      designHours: item.designHours,
      designHourRate: effectiveDesignRate,
      assemblyHours: item.assemblyHours,
      assemblyHourRate: effectiveAssemblyRate,
    });
    const marginRate = item.marginRate ?? 0.15;
    const prices = calcItemPrices(directCost, marginRate);
    item.directCost = directCost;
    item.basicPrice = prices.basicPrice;
    item.accountingPrice = prices.accountingPrice;

    newItems[index] = item;
    onItemsChange(newItems);
  };

  const isInDB = (code: string) => catalog.length > 0 ? catalog.some(c => c.code === code) : null;

  // 解析版本号：从编码尾部匹配 -Vx.y
  const parseVersion = (code: string): { version: string; isTemp: boolean } | null => {
    const m = code?.match(/-V(\d+\.\d+)$/);
    if (!m) return null;
    const major = parseInt(m[1], 10);
    return { version: 'V' + m[1], isTemp: major < 1 };
  };

  // Define columns with locked widths
  const onCellLock = (w: number) => lockCellWidth(w);

  const colSeq = {
    title: '序号', dataIndex: 'itemNo', width: 44, align: 'center' as const,
    onCell: onCellLock(44),
    render: (v: number) => <span style={{ color: COLORS.textLight }}>{v}</span>,
  };

  const colType = cfg.showType ? [{
    title: '类型', dataIndex: 'itemType', width: 60, align: 'center' as const,
    onCell: onCellLock(60),
    render: (v: string, _record: GroupItem, idx: number) => {
      const fontSize = 13;
      const TYPES: ItemType[] = ['COMPLETE_SET', 'COMPONENT', 'SOFTWARE', 'SERVICE', 'PART'];
      const LABELS = { COMPLETE_SET: 'CS', COMPONENT: 'CP', SOFTWARE: 'SW', SERVICE: 'SV' } as Record<string, string>;
      const typeLabel = LABELS[v] || v;
      const nextType = () => { const cur = TYPES.indexOf(v as ItemType); return TYPES[(cur + 1) % TYPES.length]; };
      if (!editing) {
        return <span style={{
          fontSize,
          color: typeColors[v] || COLORS.chartGray, textAlign: 'center', display: 'block'
        }}>{typeLabel}</span>;
      }
      return (
        <span onClick={() => updateItem(idx, { itemType: nextType() })}
          style={{
            fontSize, cursor: 'pointer', display: 'block', textAlign: 'center',
            color: typeColors[v] || COLORS.chartGray, userSelect: 'none'
          }}
          title={'点击切换类型'}
        >{typeLabel}</span>
      );
    },
  }] : [];

    const colCode: ColumnsType<GroupItem> = [{
    title: '编码', dataIndex: 'code', width: 200,
    onCell: () => ({ style: { width: 200, minWidth: 200, maxWidth: 200 } }),
    render: (v: string, _rec: GroupItem, idx: number) => {
      if (!editing) {
        const matched = isInDB(v);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13, color: matched === false ? COLORS.textLight : (parseVersion(v)?.isTemp ? '#fa8c16' : COLORS.primary) }}>{v}</span>
            {v && matched === false && (
              <Tooltip title="此编码不在组件数据库中，请先注册">
                <span style={{ color: 'red', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>!</span>
              </Tooltip>
            )}
          </div>
        );
      }
      const matched = isInDB(v);
      return <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <CodeCell value={v} onSelect={(item) => updateItem(idx, { code: item.code, description: item.nameCn, itemType: item.category, unitCost: item.unitCost, sourcingType: item.sourcingType, designHours: item.designHours, assemblyHours: item.assemblyHours, designHourRate: _rec.designHourRate || 175, assemblyHourRate: _rec.assemblyHourRate || 85, unit: item.unit || '套', hasWarranty: item.hasWarranty })} />
        {v && matched === false && (
          <Tooltip title="此编码不在组件数据库中，请先注册">
            <span style={{ color: 'red', fontWeight: 700, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>!</span>
          </Tooltip>
        )}
      </div>;
    },
  }];

  const colDesc: ColumnsType<GroupItem> = [{
    title: '描述', dataIndex: 'description', width: 280,
    onCell: onCellLock(280),
    render: (v: string) => {
      const display = v || '-';
      return (
        <Tooltip title={display} placement="topLeft">
          <span style={{ fontSize: 13, color: COLORS.textSecondary, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        </Tooltip>
      );
    },
  }];

  const colSourcing: ColumnsType<GroupItem> = cfg.showSourcing ? [{
    title: '外购', dataIndex: 'sourcingType', width: 52, align: 'center' as const,
    onCell: onCellLock(52),
    render: (v: SourcingType) => (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: 3,
        border: `2px solid #ccc`,
        background: 'transparent',
        color: COLORS.primary, fontSize: 11, fontWeight: 700, lineHeight: 1,
        userSelect: 'none',
      }}>
        {v === 'PURCHASED' ? '✓' : '✗'}
      </span>
    ),
  }] : [];

  const colQty: ColumnsType<GroupItem> = cfg.hideQty ? [] : [{
    title: '数量', dataIndex: 'qtyTotal', width: 52, align: 'center' as const,
    onCell: onCellLock(52),
    render: (v: number, _record: GroupItem, idx: number) => editing ? (
      <input type="number" min={0} defaultValue={v}
        onChange={e => { const raw = e.target.value; if (raw === '') return; const val = parseInt(raw, 10); if (!isNaN(val) && val >= 0) updateItem(idx, { qtyTotal: val }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: '100%', textAlign: 'center', ...BARE_INPUT_STYLE, fontSize: 13, MozAppearance: 'textfield' }} />
    ) : <span style={{ display: 'block', textAlign: 'center' }}>{v}</span>,
  }];

  const colCost: ColumnsType<GroupItem> = [{
    title: '单位成本', dataIndex: 'unitCost', width: 96, align: 'right' as const,
    onCell: onCellLock(96),
    render: (v: number, _rec: GroupItem, idx: number) => {
      if (!editing || groupType === 'EQUIPMENT') {
        return <span>{'¥'}{Math.round(v).toLocaleString()}</span>;
      }
      return (
        <input type="number" min={0} step={1} defaultValue={v}
          onChange={e => { const raw = e.target.value; if (raw === '') return; const val = parseFloat(raw); if (!isNaN(val) && val >= 0) updateItem(idx, { unitCost: val }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: '100%', textAlign: 'right', ...BARE_INPUT_STYLE, fontSize: 13, MozAppearance: 'textfield' }} />
      );
    },
  }];

  const colDesign: ColumnsType<GroupItem> = cfg.showDesign ? [{
    title: '设计工时', dataIndex: 'designHours', width: 56, align: 'right' as const,
    onCell: onCellLock(56),
    render: (v: number, _rec: GroupItem, idx: number) => {
      if (!editing || groupType === 'EQUIPMENT') {
        return <span style={{ display: 'block', textAlign: 'right' }}>{v}</span>;
      }
      return (
        <input type="number" min={0} step={0.5} defaultValue={v}
          onChange={e => { const raw = e.target.value; if (raw === '') return; const val = parseFloat(raw); if (!isNaN(val) && val >= 0) updateItem(idx, { designHours: val }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: '100%', textAlign: 'right', ...BARE_INPUT_STYLE, fontSize: 13, MozAppearance: 'textfield' }} />
      );
    },
  }] : [];

  const colAssembly: ColumnsType<GroupItem> = cfg.showAssembly ? [{
    title: '装配工时/台', dataIndex: 'assemblyHours', width: 76, align: 'right' as const,
    onCell: onCellLock(76),
    render: (v: number, _rec: GroupItem, idx: number) => {
      if (!editing || groupType === 'EQUIPMENT') {
        return <span style={{ display: 'block', textAlign: 'right' }}>{v}</span>;
      }
      return (
        <input type="number" min={0} step={0.5} defaultValue={v}
          onChange={e => { const raw = e.target.value; if (raw === '') return; const val = parseFloat(raw); if (!isNaN(val) && val >= 0) updateItem(idx, { assemblyHours: val }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: '100%', textAlign: 'right', ...BARE_INPUT_STYLE, fontSize: 13, MozAppearance: 'textfield' }} />
      );
    },
  }] : [];

  const colDC: ColumnsType<GroupItem> = [{
    title: '直接成本', dataIndex: 'directCost', width: 96, align: 'right' as const,
    onCell: onCellLock(96),
    render: (v: number) => <span style={{ fontWeight: 600 }}>{'¥'}{Math.round(v).toLocaleString()}</span>,
  }];

  const colMargin: ColumnsType<GroupItem> = [{
    title: '毛利率', dataIndex: 'marginRate', width: 55, align: 'center' as const,
    onCell: onCellLock(55),
    render: (v: number, _record: GroupItem, idx: number) => editing ? (
      <MarginInput value={v} onCommit={(val) => updateItem(idx, { marginRate: val })} />
    ) : <span style={{ display: 'block', textAlign: 'center' }}>{(v * 100).toFixed(0) + '%'}</span>,
  }];

  const colPrice: ColumnsType<GroupItem> = [{
    title: '预期售价', dataIndex: 'accountingPrice', width: 105, align: 'right' as const,
    onCell: onCellLock(105),
    render: (v: number) => <span style={{ fontWeight: 600, color: COLORS.primary }}>{'¥'}{Math.round(v).toLocaleString()}</span>,
  }];


  const colWarranty: ColumnsType<GroupItem> = cfg.showWarranty ? [{
    title: '质保', dataIndex: 'hasWarranty', width: 44, align: 'center' as const,
    onCell: onCellLock(44),
    render: (v: boolean) => (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: 3,
        border: `2px solid #ccc`,
        background: 'transparent',
        color: COLORS.primary, fontSize: 11, fontWeight: 700, lineHeight: 1,
        userSelect: 'none',
      }}>
        {v ? '✓' : '✗'}
      </span>
    ),
  }] : [];

  const colDelete: ColumnsType<GroupItem> = [{
    title: '', dataIndex: '_action', width: 32, align: 'center' as const,
    onCell: onCellLock(32),
    render: (_text: unknown, rec: GroupItem) => editing ? (
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

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
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
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <>
      <Table
      style={{ borderRadius: 8 }}
      dataSource={items.map((item) => ({ ...item, key: item.id }))}
      columns={columns}
      pagination={false}
      size="small"
      bordered
      scroll={{ x: 900 }}
    />
    </>
  );
};

export default EditableItemTable;
