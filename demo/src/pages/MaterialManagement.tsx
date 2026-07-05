import React, { useEffect, useState, useMemo } from 'react';
import { Table, Tag, Button, Drawer, Modal, Space, message } from 'antd';
import {
  PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import { mockComponentDB, mockTagTree } from '../mockData';
import { collectTagPaths, collectDescendantIds } from '../utils/tagHelpers';
import MaterialTagSelector from '../components/MaterialTagSelector';
import { formatMoney } from '../utils/calculations';
import type { Component, ItemType, SourcingType, ReviewStatus } from '../types';
import { COLORS } from '../styles/constants';
const LABEL_CELL_STYLE = { padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle', fontWeight: 600, background: COLORS.bgLight, whiteSpace: 'nowrap', color: COLORS.labelDark } as const;


// ── 常量 ──

const CATEGORY_OPTIONS: Record<ItemType, { label: string; color: string }> = {
  COMPLETE_SET:     { label: '成套', color: COLORS.primary },
  COMPONENT:        { label: '组件', color: '#008080' },
  PART:             { label: '零件', color: '#6d4c41' },
  SOFTWARE:         { label: '软件', color: COLORS.purple },
  SERVICE:          { label: '服务', color: COLORS.success },
};

const CATEGORIES: ItemType[] = ['COMPLETE_SET', 'COMPONENT', 'PART', 'SOFTWARE', 'SERVICE'];
const CATEGORY_LABELS = CATEGORIES.map(c => CATEGORY_OPTIONS[c].label);

const UNITS = ['套', '台', '个', '米', '根', '条', '包', '箱', '组', 'KG', 'L', '套件', '节点', '人天', '项', '只', '块'];

const SOURCES: { value: SourcingType; label: string }[] = [
  { value: 'SELF_MANUFACTURED', label: '自制' },
  { value: 'PURCHASED', label: '外购' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  approved: { label: '已通过', color: '#2e7d32' },
  pending:  { label: '待审核', color: COLORS.warning },
  draft:    { label: '草稿',   color: COLORS.textLight },
  rejected: { label: '已驳回', color: COLORS.danger },
};

// ── 辅助函数 ──

function deepClone(c: Component): Component {
  return { ...c, changeLog: c.changeLog.map(e => ({ ...e })) };
}

function makeId(): string {
  return 'mat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function parseVersionFromCode(code: string): { version: string; isTemp: boolean } | null {
  const m = code.match(/-V(\d+\.\d+)$/);
  if (!m) return null;
  return { version: 'V' + m[1], isTemp: parseInt(m[1], 10) < 1 };
}

// ── 组件 ──

const MaterialManagement: React.FC = () => {
  const [materials, setMaterials] = useState<Component[]>(() =>
    mockComponentDB.map(c => deepClone(c))
  );
  const [messageApi, msgContextHolder] = message.useMessage();

  // 搜索与筛选
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusTab, setStatusTab] = useState<string>('all');

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Component>>({});
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);

  // 详情 Drawer
  const [drawerItem, setDrawerItem] = useState<Component | null>(null);

  // ── 筛选逻辑 ──

  const matchesFilter = useMemo(() => {
    return (c: Component) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!c.name_cn.toLowerCase().includes(q) &&
            !c.code.toLowerCase().includes(q) &&
            !c.brand.toLowerCase().includes(q)) return false;
      }
      if (typeFilter && c.category !== typeFilter) return false;
      if (sourceFilter && c.sourcing_type !== sourceFilter) return false;
      if (statusTab !== 'all' && c.reviewStatus !== statusTab) return false;
      return true;
    };
  }, [searchText, typeFilter, sourceFilter, statusTab]);

  const displayData = useMemo(() => {
    return materials.filter(matchesFilter);
  }, [materials, matchesFilter]);

  // 品牌筛选选项（从数据动态提取）
  const brandFilterOptions = useMemo(() => {
    const brands = [...new Set(materials.filter(c => c.brand).map(c => c.brand))].sort();
    return brands.map(b => ({ text: b, value: b }));
  }, [materials]);

  // ── 编辑操作 ──

  // 标签路径映射（展平 id -> 路径数组）
  const tagPathMap = useMemo(() => collectTagPaths(mockTagTree), []);

      const openNew = () => {
    setEditingId(null);
    setEditForm({
      code: '',
      name_cn: '',
      category: 'COMPLETE_SET',
      brand: '',
      model: '',
      specification: '',
      note: '',
      supplier: '',
      unit: '套',
      sourcing_type: 'SELF_MANUFACTURED',
      unit_cost: 0,
      design_hours: 0,
      assembly_hours: 0,
      has_warranty: true,
      reviewStatus: 'pending',
      version: 'V0.1',
      tags: [],
    });
    setEditOpen(true);
  };

  const openEdit = (item: Component) => {
    setEditingId(item.id);
    setEditForm({
      code: item.code,
      name_cn: item.name_cn,
      category: item.category,
      brand: item.brand,
      model: item.model,
      specification: item.specification,
      note: item.note,
      supplier: item.supplier,
      unit: item.unit,
      sourcing_type: item.sourcing_type,
      unit_cost: item.unit_cost,
      design_hours: item.design_hours,
      assembly_hours: item.assembly_hours,
      has_warranty: item.has_warranty,
      reviewStatus: item.reviewStatus,
      version: item.version,
      tags: item.tags ? [...item.tags] : [],
    });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editForm.code) { messageApi.warning('请输入物料编码'); return; }
    if (!editForm.name_cn) { messageApi.warning('请输入物料名称'); return; }
    const _dup = materials.find(c => c.code === editForm.code && c.id !== editingId);
    if (_dup) { messageApi.warning('编码已被' + _dup.name_cn + '使用'); return; }
    const now = new Date().toISOString().slice(0, 10);
    if (editingId) {
      setMaterials(prev => prev.map(c => {
        if (c.id !== editingId) return c;
        const verChanged = editForm.code && editForm.code !== c.code;
        const newVersion = verChanged
          ? (parseVersionFromCode(editForm.code || '')?.version || c.version)
          : c.version;
        const logEntry = verChanged
          ? { version: newVersion, date: now, note: '编码变更' }
          : { version: c.version, date: now, note: '信息更新' };

        return {
          ...c,
          code: editForm.code ?? c.code,
          name_cn: editForm.name_cn ?? c.name_cn,
          category: (editForm.category as ItemType) ?? c.category,
          brand: editForm.brand ?? c.brand,
          model: editForm.model ?? c.model,
          specification: editForm.specification ?? c.specification,
          note: editForm.note ?? c.note,
          supplier: editForm.supplier ?? c.supplier,
          unit: editForm.unit ?? c.unit,
          sourcing_type: (editForm.sourcing_type as SourcingType) ?? c.sourcing_type,
          unit_cost: editForm.unit_cost ?? c.unit_cost,
          design_hours: editForm.design_hours ?? c.design_hours,
          assembly_hours: editForm.assembly_hours ?? c.assembly_hours,
          has_warranty: editForm.has_warranty ?? c.has_warranty,
          version: newVersion,
          tags: editForm.tags ?? c.tags,
          updatedAt: now,
          changeLog: [...c.changeLog, logEntry],
          reviewStatus: 'pending',
        };
      }));
      messageApi.success('物料已更新，需重新审核');
    } else {
      const parsed = parseVersionFromCode(editForm.code || '');
      const newItem: Component = {
        id: makeId(),
        code: editForm.code || '',
        name_cn: editForm.name_cn || '',
        category: (editForm.category as ItemType) || 'COMPLETE_SET',
        brand: editForm.brand || '',
        model: editForm.model || '',
        specification: editForm.specification || '',
        note: '[新建]',
        supplier: editForm.supplier || '',
        unit: editForm.unit || '套',
        sourcing_type: (editForm.sourcing_type as SourcingType) || 'SELF_MANUFACTURED',
        unit_cost: editForm.unit_cost || 0,
        design_hours: editForm.design_hours || 0,
        assembly_hours: editForm.assembly_hours || 0,
        has_warranty: editForm.has_warranty ?? true,
        reviewStatus: 'pending',
        tags: editForm.tags || [],
        version: parsed?.version || 'V0.1',
        createdAt: now,
        updatedAt: now,
        changeLog: [{ version: parsed?.version || 'V0.1', date: now, note: '新建' }],
      };
      setMaterials(prev => [...prev, newItem]);
      messageApi.success('物料已创建');
    }
    setEditOpen(false);
  };

  const deleteItem = (item: Component) => {
    Modal.confirm({
      title: '提交删除申请',
      content: `物料"${item.name_cn}"（${item.code}）的删除操作需总监审批，确认提交？`,
      okText: '提交审批',
      cancelText: '取消',
      okButtonProps: { style: { background: COLORS.primary, borderColor: COLORS.primary, borderRadius: 4 } },
      cancelButtonProps: { style: { borderRadius: 4 } },
      onOk: () => {
        setMaterials(prev => prev.map(c =>
          c.id === item.id ? { ...c, reviewStatus: 'pending' as ReviewStatus, note: '[删除]' } : c
        ));
        messageApi.success('删除申请已提交，待总监审批');
      },
    });
  };

  // ── 审核操作 ──

  const handleApprove = (item: Component) => {
    if (item.note?.startsWith('[删除]')) {
      setMaterials(prev => prev.filter(c => c.id !== item.id));
      messageApi.success('删除申请已通过，物料已移除');
    } else {
      setMaterials(prev => prev.map(c =>
        c.id === item.id ? { ...c, reviewStatus: 'approved' as ReviewStatus } : c
      ));
      messageApi.success('物料已通过审核');
    }
  };

  const handleReject = (item: Component) => {
    if (item.note?.startsWith('[删除]')) {
      setMaterials(prev => prev.map(c =>
        c.id === item.id ? { ...c, reviewStatus: 'approved' as ReviewStatus, note: '' } : c
      ));
      messageApi.warning('删除申请已驳回');
    } else {
      setMaterials(prev => prev.map(c =>
        c.id === item.id ? { ...c, reviewStatus: 'rejected' as ReviewStatus } : c
      ));
      messageApi.warning('物料已驳回');
    }
  };

  // ── 列定义 ──

  const onCellLock = (w: number) => () => ({ style: { width: w, minWidth: w, maxWidth: w } });

  const columns: any[] = [  // eslint-disable-line @typescript-eslint/no-explicit-any
    {
      title: '编码', dataIndex: 'code', width: 150,
      onCell: onCellLock(150),
      render: (v: string, rec: Component) => {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              fontFamily: 'monospace',
              color: rec.reviewStatus === 'approved' ? COLORS.primary
                   : rec.reviewStatus === 'rejected' ? COLORS.danger
                   : COLORS.textPrimary,
            }}>{v}</span>
            {rec.version && /^V0\.[0-9]/.test(rec.version) && (
              <Tag color="orange" style={{ borderRadius: 1, margin: 0, fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>临</Tag>
            )}
          </div>
        );
      },
    },
    { title: '名称', dataIndex: 'name_cn', width: 210, onCell: onCellLock(210),
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v}</span>,
    },
    {
      title: '类型', dataIndex: 'category', width: 60, align: 'center' as const, onCell: onCellLock(60),
      filters: [{ text: '全部', value: '__all__' }, ...CATEGORIES.map(c => ({ text: CATEGORY_OPTIONS[c].label, value: c }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => value === '__all__' || record.category === value,
      render: (v: ItemType) => {
        const cfg = CATEGORY_OPTIONS[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color} style={{ borderRadius: 1, margin: 0, fontSize: 12 }}>{cfg.label}</Tag>;
      },
    },
    { title: '品牌', dataIndex: 'brand', width: 55, onCell: onCellLock(55),
      filters: [{ text: '全部', value: '__all__' }, ...brandFilterOptions],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => value === '__all__' || record.brand === value,
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '供应商', dataIndex: 'supplier', width: 80, onCell: onCellLock(80),
      filters: (() => {
        const suppliers = [...new Set(materials.filter(c => c.supplier).map(c => c.supplier))].sort();
        return [{ text: '全部', value: '__all__' }, ...suppliers.map(s => ({ text: s, value: s }))];
      })(),
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => value === '__all__' || record.supplier === value,
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '型号', dataIndex: 'model', width: 90, onCell: onCellLock(90),
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '单位', dataIndex: 'unit', width: 48, align: 'center' as const, onCell: onCellLock(48),
      filters: [{ text: '全部', value: '__all__' }, ...UNITS.map(u => ({ text: u, value: u }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => value === '__all__' || record.unit === value,
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '规格', dataIndex: 'specification', width: 220, onCell: onCellLock(220),
      render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{v || '—'}</span>,
    },
    {
      title: '来源', dataIndex: 'sourcing_type', width: 52, align: 'center' as const, onCell: onCellLock(52),
      filters: [{ text: '全部', value: '__all__' }, ...SOURCES.map(s => ({ text: s.label, value: s.value }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => value === '__all__' || record.sourcing_type === value,
      render: (v: SourcingType) => (
        <Tag color={v === 'PURCHASED' ? 'orange' : COLORS.success} style={{ borderRadius: 1, margin: 0, fontSize: 12 }}>
          {v === 'PURCHASED' ? '外购' : '自制'}
        </Tag>
      ),
    },
    {
      title: '标签', dataIndex: 'tags', width: 160, onCell: onCellLock(160),
      filters: [
        { text: '全部', value: '__all__' },
        ...mockTagTree.map(t => ({ text: t.name, value: t.id })),
      ],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Component) => {
        if (value === '__all__') return true;
        const ids = collectDescendantIds(mockTagTree, value as string);
        return ids.some(id => (record.tags || []).includes(id));
      },
      render: (v: string[] | undefined) => {
        if (!v || v.length === 0) return <span style={{ fontSize: 12, color: COLORS.textDisabled }}>—</span>;
        const labels = v.map(id => {
          const found = tagPathMap.find(t => t.id === id);
          return found ? found.path.join(' / ') : id;
        });
        return <span style={{ fontSize: 12, color: '#888' }}>{labels.join('; ')}</span>;
      },
    },
    { title: '单位成本', dataIndex: 'unit_cost', width: 90, align: 'right' as const, onCell: onCellLock(90),
      render: (v: number) => <span style={{ fontWeight: 600 }}>&yen;{formatMoney(v)}</span>,
    },
    {
      title: '状态', dataIndex: 'reviewStatus', width: 70, align: 'center' as const, onCell: onCellLock(70),
      render: (v: ReviewStatus) => {
        const cfg = STATUS_CONFIG[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color} style={{ borderRadius: 1, margin: 0, fontSize: 12 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '', key: 'action', width: 130, align: 'center' as const, onCell: onCellLock(130),
      render: (_: unknown, rec: Component) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />}
            onClick={() => setDrawerItem(rec)}
            style={{ color: COLORS.primary, fontSize: 14 }} />
          <Button type="text" size="small" icon={<EditOutlined />}
            onClick={() => openEdit(rec)}
            style={{ color: rec.reviewStatus === 'pending' ? COLORS.borderInput : COLORS.primary, fontSize: 14 }}
            disabled={rec.reviewStatus === 'pending'} />
          {rec.reviewStatus === 'pending' && (
            <>
              <Button type="text" size="small" icon={<CheckOutlined />}
                onClick={() => handleApprove(rec)}
                style={{ color: COLORS.success, fontSize: 16 }} />
              <Button type="text" size="small" icon={<CloseOutlined />}
                onClick={() => handleReject(rec)}
                style={{ color: COLORS.danger, fontSize: 16 }} />
            </>
          )}
          <Button type="text" size="small" icon={<DeleteOutlined />}
            onClick={() => deleteItem(rec)}
            style={{ color: rec.reviewStatus === 'pending' ? COLORS.borderInput : COLORS.textLight, fontSize: 14 }}
            disabled={rec.reviewStatus === 'pending'} />
        </Space>
      ),
    },
  ];

  // ── 详情 Drawer ──

  const renderDrawerContent = (item: Component) => {
    const sectionHeader = (title: string) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>{title}</span>
      </div>
    );

    const infoRow = (label: string, value: React.ReactNode) => (
      <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: COLORS.textFormLabel, fontSize: 12, width: 100, flexShrink: 0 }}>{label}</span>
        <span style={{ color: '#1a2234', fontSize: 13, fontWeight: 500 }}>{value}</span>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {item.reviewStatus === 'pending' && item.note && (
          <div style={{
            background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 5,
            padding: '14px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.warning }}>⏳ 待审核</span>
              <Tag color="orange" style={{ borderRadius: 1, margin: 0, fontSize: 11 }}>
                {item.note.startsWith('[新建]') ? '新建' : item.note.startsWith('[编辑]') ? '编辑' : '删除'}
              </Tag>
            </div>
            {item.note.startsWith('[编辑]') && (
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>
                {item.note.replace('[编辑] ', '').split(' | ').map((change, i) => (
                  <div key={i} style={{ padding: '2px 0' }}>• {change}</div>
                ))}
              </div>
            )}
            {item.note.startsWith('[新建]') && (
              <div style={{ fontSize: 12, color: '#555' }}>此物料为新注册，等待总监审核通过后生效。</div>
            )}
            {item.note.startsWith('[删除]') && (
              <div style={{ fontSize: 12, color: COLORS.danger }}>此物料提交了删除申请，总监通过后将永久移除。</div>
            )}
          </div>
        )}
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5, padding: '20px 24px' }}>
          {sectionHeader('基本信息')}
          {infoRow('物料编码', item.code)}
          {infoRow('物料名称', item.name_cn)}
          {infoRow('类型', CATEGORY_OPTIONS[item.category]?.label || item.category)}
          {infoRow('品牌', item.brand || '—')}
          {infoRow('供应商', item.supplier || '—')}
          {infoRow('计量单位', item.unit || '—')}
          {infoRow('型号', item.model || '—')}
          {infoRow('规格', item.specification || '—')}
          {infoRow('来源', item.sourcing_type === 'PURCHASED' ? '外购' : '自制')}
          {infoRow('单位成本', <>&yen;{formatMoney(item.unit_cost)}</>)}
          {infoRow('设计工时', <>{item.design_hours}h</>)}
          {infoRow('装配工时', <>{item.assembly_hours}h</>)}
          {infoRow('质保', item.has_warranty ? '是' : '否')}
          {infoRow('备注', item.note || '—')}
          {infoRow('版本', item.version)}
          {infoRow('状态', <Tag color={STATUS_CONFIG[item.reviewStatus]?.color || COLORS.textLight} style={{ borderRadius: 1, margin: 0 }}>{STATUS_CONFIG[item.reviewStatus]?.label}</Tag>)}
          {infoRow('标签', item.tags && item.tags.length > 0
            ? item.tags.map(id => { const f = tagPathMap.find(t => t.id === id); return f ? f.path.join(' / ') : id; }).join('; ')
            : '—')}
          {infoRow('创建时间', item.createdAt)}
          {infoRow('更新时间', item.updatedAt)}
        </div>

        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5, padding: '20px 24px' }}>
          {sectionHeader('变更历史')}
          {item.changeLog.length > 0 ? (
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: COLORS.border }} />
              {[...item.changeLog].reverse().map((entry, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 4, width: 12, height: 12,
                    borderRadius: '50%', background: COLORS.primary, border: '2px solid #fff',
                  }} />
                  <div style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 600 }}>{entry.version}</div>
                  <div style={{ fontSize: 12, color: COLORS.textLight }}>{entry.date}</div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>{entry.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 12, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无变更记录</div>
          )}
        </div>
      </div>
    );
  };

  // ── 统计 ──

  const tabCounts = useMemo(() => {
    const all = materials.length;
    const approved = materials.filter(c => c.reviewStatus === 'approved').length;
    const pending = materials.filter(c => c.reviewStatus === 'pending').length;
    return { all, approved, pending };
  }, [materials]);

  // ── Render ──
  // Inject material-table-specific styles
  useEffect(() => {
    const css = `
.mat-table .ant-table-tbody > tr:hover > td { background: #f0f6ff !important; }
.mat-table .ant-table-tbody > tr > td { padding: 7px 8px !important; }
.mat-table .ant-table-filter-trigger { color: #8892a4 !important; }
.mat-table .ant-table-filter-trigger:hover { color: var(--color-primary) !important; }
.mat-table .ant-table-filter-trigger.active,
.mat-table .ant-table-filter-trigger.ant-table-filter-trigger.active { color: var(--color-primary) !important; }
`;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);


  return (
    <div>
      {msgContextHolder}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 4 }}>物料数据管理</div>
      <div style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16 }}>&nbsp;</div>

      {/* 搜索 + 筛选栏 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <colgroup>
          <col width="44" /><col width="auto" /><col width="44" /><col width="100" /><col width="44" /><col width="100" /><col width="50" />
        </colgroup>
        <tbody>
          <tr>
            <td style={LABEL_CELL_STYLE}>搜索</td>
            <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <input placeholder="搜索物料名称 / 编码 / 品牌"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
            </td>
            <td style={LABEL_CELL_STYLE}>类型</td>
            <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                onClick={() => {
                  const opts = ['', ...CATEGORY_LABELS];
                  const cur = opts.indexOf(typeFilter ? CATEGORY_OPTIONS[typeFilter as ItemType]?.label || '' : '');
                  const next = opts[(cur + 1) % opts.length];
                  setTypeFilter(next ? CATEGORIES[CATEGORY_LABELS.indexOf(next)] : '');
                }}>
                {typeFilter ? CATEGORY_OPTIONS[typeFilter as ItemType]?.label || typeFilter : '全部'} ▾
              </span>
            </td>
            <td style={LABEL_CELL_STYLE}>来源</td>
            <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                onClick={() => {
                  const opts = ['', ...SOURCES.map(s => s.label)];
                  const cur = opts.indexOf(sourceFilter ? (sourceFilter === 'PURCHASED' ? '外购' : '自制') : '');
                  const next = opts[(cur + 1) % opts.length];
                  setSourceFilter(next === '外购' ? 'PURCHASED' : next === '自制' ? 'SELF_MANUFACTURED' : '');
                }}>
                {sourceFilter ? (sourceFilter === 'PURCHASED' ? '外购' : '自制') : '全部'} ▾
              </span>
            </td>
            <td style={{ padding: 0, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle', textAlign: 'center' }}>
              <Button type="text" icon={<PlusOutlined />} onClick={openNew}
                style={{ color: COLORS.primary, fontSize: 18, width: 42, height: 42 }} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 状态标签 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => setStatusTab('all')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'all' ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: statusTab === 'all' ? COLORS.primary : COLORS.textSecondary, fontWeight: statusTab === 'all' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>全部({tabCounts.all})
        </div>
        <div onClick={() => setStatusTab('approved')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'approved' ? '2px solid #2e7d32' : '2px solid transparent',
            color: statusTab === 'approved' ? '#2e7d32' : COLORS.textSecondary, fontWeight: statusTab === 'approved' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>已通过({tabCounts.approved})
        </div>
        <div onClick={() => setStatusTab('pending')}
          style={{
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
            borderBottom: statusTab === 'pending' ? `2px solid ${COLORS.warning}` : '2px solid transparent',
            color: statusTab === 'pending' ? COLORS.warning : COLORS.textSecondary, fontWeight: statusTab === 'pending' ? 600 : 400,
            marginBottom: -2, transition: 'all 0.15s',
          }}>待审核({tabCounts.pending})
        </div>
      </div>

      {/* 表格 */}
      {/* Style injected via useEffect */}
      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        className="mat-table"
        dataSource={displayData}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 1400 }}
        style={{ background: '#fff', borderRadius: 8 }}
      />
      </div>

      {/* ── 编辑模态框 ── */}
      <Modal
        title={
          <span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>
            {editingId ? '编辑物料' : '新增物料'}
          </span>
        }
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        width={920}
        destroyOnHidden
        styles={{ body: { padding: '24px 28px 8px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setEditOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={saveEdit}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <div style={{
          background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>物料信息</span>
            <span style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 8 }}>
              编码格式：{'{类型缩写}-{名称}-{型号}-V{版本}'}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col width="100" /><col width="1.3*" /><col width="100" /><col width="1.3*" /><col width="100" /><col width="0.4*" />
            </colgroup>
            <tbody>
              <tr>
                <td style={LABEL_CELL_STYLE}>物料编码</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.code || ''}
                    onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="M-NAME-MODEL-V1.0"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box', fontFamily: 'monospace', fontWeight: 600 }} />
                </td>
                <td style={LABEL_CELL_STYLE}>物料名称</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.name_cn || ''}
                    onChange={e => setEditForm(p => ({ ...p, name_cn: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>类型</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                    onClick={() => {
                      const cur = CATEGORIES.indexOf((editForm.category as ItemType) || 'COMPLETE_SET');
                      setEditForm(p => ({ ...p, category: CATEGORIES[(cur + 1) % CATEGORIES.length] }));
                    }}>
                    {editForm.category ? CATEGORY_OPTIONS[editForm.category as ItemType]?.label || editForm.category : '点击选择'} ▾
                  </span>
                </td>
                <td style={LABEL_CELL_STYLE}>品牌</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.brand || ''}
                    onChange={e => setEditForm(p => ({ ...p, brand: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>供应商</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.supplier || ''}
                    onChange={e => setEditForm(p => ({ ...p, supplier: e.target.value }))}
                    placeholder="贸易商/代理商/厂商"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
                <td style={LABEL_CELL_STYLE}>型号</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.model || ''}
                    onChange={e => setEditForm(p => ({ ...p, model: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
                <td style={LABEL_CELL_STYLE}>规格</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.specification || ''}
                    onChange={e => setEditForm(p => ({ ...p, specification: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>来源</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                    onClick={() => {
                      const cur = SOURCES.findIndex(s => s.value === editForm.sourcing_type);
                      const next = SOURCES[(cur + 1) % SOURCES.length];
                      setEditForm(p => ({ ...p, sourcing_type: next.value }));
                    }}>
                    {editForm.sourcing_type === 'PURCHASED' ? '外购' : editForm.sourcing_type === 'SELF_MANUFACTURED' ? '自制' : '点击选择'} ▾
                  </span>
                </td>
                <td style={LABEL_CELL_STYLE}>单位</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                      onClick={() => setUnitDropdownOpen(p => !p)}>
                      {editForm.unit || '套'} <span style={{ fontSize: 10 }}>▾</span>
                    </span>
                    {unitDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 10,
                        background: '#fff', border: `1px solid ${COLORS.borderInput}`, borderRadius: 4,
                        minWidth: 80, maxHeight: 240, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}>
                        {UNITS.map(u => (
                          <div key={u}
                            onClick={() => { setEditForm(p => ({ ...p, unit: u })); setUnitDropdownOpen(false); }}
                            style={{
                              padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                              color: (editForm.unit || '套') === u ? COLORS.primary : COLORS.textPrimary,
                              background: (editForm.unit || '套') === u ? '#eef4ff' : 'transparent',
                              fontWeight: (editForm.unit || '套') === u ? 600 : 400,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f5f8ff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = (editForm.unit || '套') === u ? '#eef4ff' : 'transparent'; }}
                          >{u}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td style={LABEL_CELL_STYLE}>单位成本</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input type="number" min={0} value={editForm.unit_cost ?? 0}
                    onChange={e => setEditForm(p => ({ ...p, unit_cost: parseInt(e.target.value) || 0 }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>设计工时</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input type="number" min={0} value={editForm.design_hours ?? 0}
                    onChange={e => setEditForm(p => ({ ...p, design_hours: parseInt(e.target.value) || 0 }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
                <td style={LABEL_CELL_STYLE}>装配工时</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input type="number" min={0} value={editForm.assembly_hours ?? 0}
                    onChange={e => setEditForm(p => ({ ...p, assembly_hours: parseInt(e.target.value) || 0 }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>质保</td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                    onClick={() => setEditForm(p => ({ ...p, has_warranty: !p.has_warranty }))}>
                    {editForm.has_warranty ? '是' : '否'} ▾
                  </span>
                </td>
                <td style={LABEL_CELL_STYLE}></td>
                <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}></td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>标签</td>
                <td colSpan={5} style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <MaterialTagSelector
                    value={editForm.tags as string[] || []}
                    onChange={val => setEditForm(p => ({ ...p, tags: val }))}
                  />
                </td>
              </tr>
              <tr>
                <td style={LABEL_CELL_STYLE}>说明</td>
                <td colSpan={5} style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                  <input value={editForm.note || ''}
                    onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="物料用途、技术参数补充说明…"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
            编码规则：{'{类型缩写}-{名称}-{型号}-V{版本}'}，如 M-RACK-3015-V1.0。V0.x = 临时物料，V1.0+ = 正式物料。
            新建或编辑后物料状态自动变为"草稿"，提交审核后由总监审批。
          </div>
        </div>
      </Modal>

      {/* ── 详情 Drawer ── */}
      <Drawer
        title={
          drawerItem ? (
            <Space>
              <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.textDark }}>{drawerItem.name_cn}</span>
              <Tag color={STATUS_CONFIG[drawerItem.reviewStatus]?.color || COLORS.textLight} style={{ borderRadius: 1 }}>
                {STATUS_CONFIG[drawerItem.reviewStatus]?.label}
              </Tag>
              <span style={{ fontSize: 12, color: COLORS.textLight }}>{drawerItem.code}</span>
            </Space>
          ) : ''
        }
        placement="right"
        onClose={() => setDrawerItem(null)}
        open={!!drawerItem}
        styles={{ wrapper: { width: 600 } }}
      >
        {drawerItem && renderDrawerContent(drawerItem)}
      </Drawer>
    </div>
  );
};

export default MaterialManagement;
