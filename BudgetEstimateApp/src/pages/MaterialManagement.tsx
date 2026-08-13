import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined,
  CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import { componentService } from '../services/componentService';
import { invalidateCatalogCache } from '../services/catalogCache';
import { tagService } from '../services/tagService';
import { collectTagPaths, collectDescendantIds, findPath, uid } from '../utils/tagHelpers';
import { parseVersionFromCode } from '../utils/codeVersion';
import { formatMoney } from '../utils/calculations';
import type { Component, ItemType, SourcingType, ReviewStatus, TagNode } from '../types';
import { COLORS, LABEL_CELL_STYLE } from '../styles/colors';
import { lockCellWidth, BARE_INPUT_STYLE } from '../utils/tableUtils';
import {
  MaterialEditModal, MaterialDeleteModal,
} from '../components/material/MaterialModals';
import {
  CATEGORY_OPTIONS, CATEGORIES, CATEGORY_LABELS,
  SOURCES, UNITS, STATUS_CONFIG, validateCodeFormat,
} from '../components/material/materialConstants';
import { MaterialDrawer } from '../components/material/MaterialDrawer';
import { tabItemStyle } from '../utils/tableUtils';
import { useAuth } from '../utils/authContext';
import { hasPermission } from '../utils/permissions';


// ── 辅助函数 ──

function deepClone(c: Component): Component {
  return { ...c, changeLog: Array.isArray(c.changeLog) ? c.changeLog.map(e => ({ ...e })) : [] };
}

/** 编辑 payload：editForm 有值用 editForm，否则保留 target（`??` 保留合法 0） */
function buildEditFields(form: Partial<Component>, target: Component): Partial<Component> {
  return {
    code: form.code ?? target.code,
    nameCn: form.nameCn ?? target.nameCn,
    category: form.category ?? target.category,
    brand: form.brand ?? target.brand,
    model: form.model ?? target.model,
    specification: form.specification ?? target.specification,
    note: form.note ?? target.note,
    supplier: form.supplier ?? target.supplier,
    unit: form.unit ?? target.unit,
    sourcingType: form.sourcingType ?? target.sourcingType,
    unitCost: form.unitCost ?? target.unitCost,
    designHours: form.designHours ?? target.designHours,
    assemblyHours: form.assemblyHours ?? target.assemblyHours,
    hasWarranty: form.hasWarranty ?? target.hasWarranty,
    tags: form.tags ?? target.tags,
  };
}

/** 新建 payload（默认值兜底） */
function buildCreateFields(form: Partial<Component>, parsedVersion: string, now: string): Partial<Component> {
  return {
    code: form.code || '',
    nameCn: form.nameCn || '',
    category: form.category || 'COMPLETE_SET',
    brand: form.brand || '',
    model: form.model || '',
    specification: form.specification || '',
    note: '[新建]',
    supplier: form.supplier || '',
    unit: form.unit || '套',
    sourcingType: form.sourcingType || 'SELF_MANUFACTURED',
    unitCost: form.unitCost || 0,
    designHours: form.designHours || 0,
    assemblyHours: form.assemblyHours || 0,
    hasWarranty: form.hasWarranty ?? true,
    reviewStatus: 'pending',
    tags: form.tags || [],
    version: parsedVersion || 'V0.1',
    createdAt: now,
    updatedAt: now,
    changeLog: [{ version: parsedVersion || 'V0.1', date: now, note: '新建' }],
  };
}

/** 编码变更时计算新版本号与变更日志条目（编辑场景） */
function versionAndLog(form: Partial<Component>, currentCode: string, currentVersion: string, now: string) {
  const verChanged = form.code && form.code !== currentCode;
  const newVersion = verChanged
    ? (parseVersionFromCode(form.code || '')?.version || currentVersion)
    : currentVersion;
  const logEntry = verChanged
    ? { version: newVersion, date: now, note: '编码变更' }
    : { version: currentVersion, date: now, note: '信息更新' };
  return { newVersion, logEntry };
}

const onCellLock = (w: number) => lockCellWidth(w);

/** 状态 Tab 样式（active 高亮色可配），收敛重复内联样式 */
// ── 组件 ──

const MaterialManagement: React.FC = () => {
  const [materials, setMaterials] = useState<Component[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, msgContextHolder] = message.useMessage();
  const { user } = useAuth();
  // ⚠️ A1 复核：写动作需「新增物料」权限（与后端 writeGuard 同源）；无写权用户隐藏增/改/删/审核按钮，仅可查看
  const canWrite = hasPermission(user?.permissions, ['新增物料', '全部查看权限']);

  // ── 数据加载 ──

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      // ⚠️ 传 limit:'1000'，避免后端默认 limit=100 导致列表截断
      const res = await componentService.list({ limit: '1000' });
      if (res) {
        setMaterials(res.map(c => deepClone(c)));
      }
    } catch (err: unknown) {
      messageApi.error('加载物料数据失败：' + ((err as Error).message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  // 搜索与筛选
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusTab, setStatusTab] = useState<string>('all');

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Component>>({});

  // 详情 Drawer
  const [drawerItem, setDrawerItem] = useState<Component | null>(null);
  const [deleteModalItem, setDeleteModalItem] = useState<Component | null>(null);

  // ── 筛选逻辑 ──

  const matchesFilter = useMemo(() => {
    return (c: Component) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!c.nameCn.toLowerCase().includes(q) &&
            !c.code.toLowerCase().includes(q) &&
            !c.brand.toLowerCase().includes(q)) return false;
      }
      if (typeFilter && c.category !== typeFilter) return false;
      if (sourceFilter && c.sourcingType !== sourceFilter) return false;
      if (statusTab !== 'all' && c.reviewStatus !== statusTab) return false;
      return true;
    };
  }, [searchText, typeFilter, sourceFilter, statusTab]);

  const displayData = useMemo(() => {
    return materials.filter(matchesFilter);
  }, [materials, matchesFilter]);

  // ── 标签树（需在 groupedRows 之前声明）──
  const [tagTree, setTagTree] = useState<TagNode[]>([]);

  useEffect(() => {
    tagService.getTree().then(data => {
      if (data && data.length > 0) setTagTree(data);
    }).catch(() => {});
  }, []);

  const tagPathMap = useMemo(() => collectTagPaths(tagTree), [tagTree]);

  // ── 按标签排序 ──
  // 物料按最深 tag 路径名称排序，同标签物料连续显示
  const sortedMaterials = useMemo(() => {
    const idToLabel = new Map<string, string>();
    (function walk(nodes: TagNode[], prefix: string[]) {
      for (const n of nodes) {
        idToLabel.set(n.id, [...prefix, n.name].join(' > '));
        if (n.children) walk(n.children, [...prefix, n.name]);
      }
    })(tagTree, []);

    const sortKey = (item: Component): string => {
      const t = item.tags || [];
      let bestId: string | null = null;
      let bestDepth = -1;
      for (const id of t) {
        // ⚠️ 用 findPath 计算真实深度（原实现只在直接子级查找，≥2 层标签恒被当 depth=1，排序偏向根标签）
        const path = findPath(tagTree, id);
        const depth = path ? path.length : 0;
        if (depth > bestDepth) { bestDepth = depth; bestId = id; }
      }
      if (bestId) return idToLabel.get(bestId) || '';
      return '~~未分类';
    };

    return [...displayData].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'zh'));
  }, [displayData, tagTree]);


  // 品牌筛选选项（从数据动态提取）
  const brandFilterOptions = useMemo(() => {
    const brands = [...new Set(materials.filter(c => c.brand).map(c => c.brand))].sort();
    return brands.map(b => ({ text: b, value: b }));
  }, [materials]);

  // ── 编辑操作 ──

  const openNew = () => {
    setEditingId(null);
    setEditForm({
      code: '',
      nameCn: '',
      category: 'COMPLETE_SET',
      brand: '',
      model: '',
      specification: '',
      note: '',
      supplier: '',
      unit: '套',
      sourcingType: 'SELF_MANUFACTURED',
      unitCost: 0,
      designHours: 0,
      assemblyHours: 0,
      hasWarranty: true,
      reviewStatus: 'pending',
      version: 'V0.1',
      tags: [],
    });
    setEditOpen(true);
  };

  const openEdit = useCallback((item: Component) => {
    setEditingId(item.id);
    setEditForm({
      code: item.code,
      nameCn: item.nameCn,
      category: item.category,
      brand: item.brand,
      model: item.model,
      specification: item.specification,
      note: item.note,
      supplier: item.supplier,
      unit: item.unit,
      sourcingType: item.sourcingType,
      unitCost: item.unitCost,
      designHours: item.designHours,
      assemblyHours: item.assemblyHours,
      hasWarranty: item.hasWarranty,
      reviewStatus: item.reviewStatus,
      version: item.version,
      tags: item.tags ? [...item.tags] : [],
    });
    setEditOpen(true);
  }, []);

  const saveEdit = async () => {
    if (!editForm.code) { messageApi.warning('请输入物料编码'); return; }
    if (!editForm.nameCn) { messageApi.warning('请输入物料名称'); return; }
    const codeCheck = validateCodeFormat(editForm.code);
    if (!codeCheck.valid) { messageApi.warning(codeCheck.error); return; }
    const _dup = materials.find(c => c.code === editForm.code && c.id !== editingId);
    if (_dup) { messageApi.warning('编码已被' + _dup.nameCn + '使用'); return; }
    const now = new Date().toISOString().slice(0, 10);
    try {
      if (editingId) {
        const target = materials.find(c => c.id === editingId);
        if (!target) return;
        const { newVersion, logEntry } = versionAndLog(editForm, target.code, target.version, now);
        await componentService.update(editingId, {
          ...buildEditFields(editForm, target),
          version: newVersion,
          updatedAt: now,
          changeLog: [...target.changeLog, logEntry],
          reviewStatus: 'pending',
        });
        messageApi.success('物料已更新，需重新审核');
      } else {
        const parsed = parseVersionFromCode(editForm.code || '');
        await componentService.create(buildCreateFields(editForm, parsed?.version || 'V0.1', now));
        messageApi.success('物料已创建');
      }
      await loadMaterials();
      invalidateCatalogCache(); // ⚠️ B2：物料变更后失效报价页编码下拉缓存
    } catch (err) {
      console.error('[Material] 保存失败:', err);
      // API 失败，回退到本地更新（仅本地展示，刷新后丢失）
      if (editingId) {
        setMaterials(prev => prev.map(c => {
          if (c.id !== editingId) return c;
          const { newVersion, logEntry } = versionAndLog(editForm, c.code, c.version, now);
          return {
            ...c,
            ...buildEditFields(editForm, c),
            version: newVersion,
            updatedAt: now,
            changeLog: [...c.changeLog, logEntry],
            reviewStatus: 'pending',
          };
        }));
        messageApi.warning('保存失败，已保存到本地');
      } else {
        const parsed = parseVersionFromCode(editForm.code || '');
        const newItem: Component = { id: uid('mat'), ...buildCreateFields(editForm, parsed?.version || 'V0.1', now) } as Component;
        setMaterials(prev => [...prev, newItem]);
        messageApi.warning('保存失败，已保存到本地');
      }
    }
    setEditOpen(false);
  };

  const deleteItem = useCallback((item: Component) => {
    setDeleteModalItem(item);
  }, []);

  const confirmDeleteItem = async () => {
    if (!deleteModalItem) return;
    const item = deleteModalItem;
    try {
      if (item.note?.startsWith('[删除]')) {
        await componentService.delete(item.id);
        messageApi.success('物料已永久删除');
      } else {
        await componentService.update(item.id, { reviewStatus: 'pending' as ReviewStatus, note: '[删除]' } as Partial<Component>);
        messageApi.success('删除申请已提交，待总监审批');
      }
      await loadMaterials();
      invalidateCatalogCache(); // ⚠️ B2
    } catch (err) {
      console.error('[Material] 保存失败:', err);
      // API 失败，回退到本地更新（仅本地展示，刷新后丢失）
      if (item.note?.startsWith('[删除]')) {
        setMaterials(prev => prev.filter(c => c.id !== item.id));
        messageApi.warning('删除失败，已从本地移除（刷新后恢复）');
      } else {
        setMaterials(prev => prev.map(c =>
          c.id === item.id ? { ...c, reviewStatus: 'pending' as ReviewStatus, note: '[删除]' } : c
        ));
        messageApi.warning('删除申请提交失败，已保存到本地');
      }
    }
    setDeleteModalItem(null);
  };

  // ── 审核操作 ──

  const handleApprove = useCallback(async (item: Component) => {
    if (item.reviewStatus !== 'pending') { messageApi.warning('仅待审核状态的物料可审核'); return; }
    try {
      if (item.note?.startsWith('[删除]')) {
        await componentService.delete(item.id);
        messageApi.success('删除申请已通过，物料已移除');
      } else {
        await componentService.update(item.id, { reviewStatus: 'approved' as ReviewStatus } as Partial<Component>);
        messageApi.success('物料已通过审核');
      }
      await loadMaterials();
      invalidateCatalogCache(); // ⚠️ B2
    } catch (err) {
      console.error('[Material] 保存失败:', err);
      // API 失败，回退到本地更新
      if (item.note?.startsWith('[删除]')) {
        setMaterials(prev => prev.filter(c => c.id !== item.id));
      } else {
        setMaterials(prev => prev.map(c =>
          c.id === item.id ? { ...c, reviewStatus: 'approved' as ReviewStatus } : c
        ));
      }
    }
  }, [loadMaterials, messageApi]);

  const handleReject = useCallback(async (item: Component) => {
    if (item.reviewStatus !== 'pending') { messageApi.warning('仅待审核状态的物料可审核'); return; }
    try {
      if (item.note?.startsWith('[删除]')) {
        await componentService.update(item.id, { reviewStatus: 'approved' as ReviewStatus, note: '' } as Partial<Component>);
        messageApi.warning('删除申请已驳回');
      } else {
        await componentService.update(item.id, { reviewStatus: 'rejected' as ReviewStatus } as Partial<Component>);
        messageApi.warning('物料已驳回');
      }
      await loadMaterials();
      invalidateCatalogCache(); // ⚠️ B2
    } catch (err) {
      console.error('[Material] 保存失败:', err);
      // API 失败，回退到本地更新
      if (item.note?.startsWith('[删除]')) {
        setMaterials(prev => prev.map(c =>
          c.id === item.id ? { ...c, reviewStatus: 'approved' as ReviewStatus, note: '' } : c
        ));
      } else {
        setMaterials(prev => prev.map(c =>
          c.id === item.id ? { ...c, reviewStatus: 'rejected' as ReviewStatus } : c
        ));
      }
    }
  }, [loadMaterials, messageApi]);

  // ── 列定义 ──

  const columns: ColumnsType<Component> = useMemo(() => [
    {
      title: '编码', dataIndex: 'code', width: 175,
      onCell: onCellLock(175),
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
    { title: '名称', dataIndex: 'nameCn', width: 135, onCell: onCellLock(135),
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v}</span>,
    },
    {
      title: '类型', dataIndex: 'category', width: 60, align: 'center' as const, onCell: onCellLock(60),
      filters: [{ text: '全部', value: '__all__' }, ...CATEGORIES.map(c => ({ text: CATEGORY_OPTIONS[c].label, value: c }))],
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => value === '__all__' || record.category === value,
      render: (v: ItemType) => {
        const cfg = CATEGORY_OPTIONS[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color} style={{ borderRadius: 1, margin: 0, fontSize: 12 }}>{cfg.label}</Tag>;
      },
    },
    { title: '品牌', dataIndex: 'brand', width: 55, onCell: onCellLock(55),
      filters: [{ text: '全部', value: '__all__' }, ...brandFilterOptions],
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => value === '__all__' || record.brand === value,
      render: (v: string | undefined) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '供应商', dataIndex: 'supplier', width: 80, onCell: onCellLock(80),
      filters: (() => {
        const suppliers = [...new Set(materials.filter(c => c.supplier).map(c => c.supplier))].sort();
        return [{ text: '全部', value: '__all__' }, ...suppliers.map(s => ({ text: s, value: s }))];
      })(),
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => value === '__all__' || record.supplier === value,
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '型号', dataIndex: 'model', width: 90, onCell: onCellLock(90),
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '单位', dataIndex: 'unit', width: 48, align: 'center' as const, onCell: onCellLock(48),
      filters: [{ text: '全部', value: '__all__' }, ...UNITS.map(u => ({ text: u, value: u }))],
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => value === '__all__' || record.unit === value,
      render: (v: string) => <span style={{ fontSize: 12, color: '#555' }}>{v || '—'}</span>,
    },
    { title: '规格', dataIndex: 'specification', width: 210, onCell: onCellLock(210),
      render: (v: string) => <span title={v} style={{ fontSize: 12, color: COLORS.textSecondary, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '—'}</span>,
    },
    {
      title: '来源', dataIndex: 'sourcingType', width: 52, align: 'center' as const, onCell: onCellLock(52),
      filters: [{ text: '全部', value: '__all__' }, ...SOURCES.map(s => ({ text: s.label, value: s.value }))],
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => value === '__all__' || record.sourcingType === value,
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
        ...tagTree.map(t => ({ text: t.name, value: t.id })),
      ],
      filterSearch: true,
      onFilter: (value: unknown, record: Component) => {
        if (value === '__all__') return true;
        const ids = collectDescendantIds(tagTree, value as string);
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
    { title: '单位成本', dataIndex: 'unitCost', width: 85, align: 'right' as const, onCell: onCellLock(85),
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
      title: '', key: 'action', width: 100, align: 'center' as const, onCell: onCellLock(100),
      render: (_: unknown, rec: Component) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />}
            onClick={() => setDrawerItem(rec)}
            style={{ color: COLORS.primary, fontSize: 14 }} />
          {canWrite && (
            <>
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
            </>
          )}
        </Space>
      ),
    },
  ], [materials, tagTree, tagPathMap, brandFilterOptions, canWrite, openEdit, deleteItem, handleApprove, handleReject]);

  // ── 统计 ──

  const tabCounts = useMemo(() => {
    const all = materials.length;
    const approved = materials.filter(c => c.reviewStatus === 'approved').length;
    const pending = materials.filter(c => c.reviewStatus === 'pending').length;
    return { all, approved, pending };
  }, [materials]);

  // ── Render ──

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
                style={{ width: '100%', ...BARE_INPUT_STYLE, fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
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
              {canWrite && (
                <Button type="text" icon={<PlusOutlined />} onClick={openNew}
                  style={{ color: COLORS.primary, fontSize: 18, width: 42, height: 42 }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#3a4a6a', lineHeight: 1.8 }}>
        <strong style={{ color: COLORS.primary }}>说明：</strong>
        物料的编码格式，&nbsp;<code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>{'{类型缩写2位}-{用途6位}-{规格6位}-V{版本}'}</code>
        &nbsp;|&nbsp; 类型缩写：成套=EQ，组件/部件=CP，工程服务=SV，软件=SW
        &nbsp;|&nbsp; 版本 V1.0+ 为正式版，V0.x 为临时版
      </div>

      {/* 状态标签 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${COLORS.border}` }}>
        <div onClick={() => setStatusTab('all')} style={tabItemStyle(statusTab === 'all', COLORS.primary)}>全部({tabCounts.all})</div>
        <div onClick={() => setStatusTab('approved')} style={tabItemStyle(statusTab === 'approved', COLORS.success)}>已通过({tabCounts.approved})</div>
        <div onClick={() => setStatusTab('pending')} style={tabItemStyle(statusTab === 'pending', COLORS.warning)}>待审核({tabCounts.pending})</div>
      </div>

      {/* 表格 */}
      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        className="mat-table"
        loading={loading}
        dataSource={sortedMaterials}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 1320 }}
        locale={{ emptyText: <Empty description="暂无匹配的物料" /> }}
        style={{ background: '#fff', borderRadius: 8 }}
      />
      </div>

      {/* ── 编辑模态框 ── */}
      <MaterialEditModal
        open={editOpen}
        editingId={editingId}
        editForm={editForm}
        onFormChange={setEditForm}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
      />

      {/* ── 删除确认弹窗 ── */}
      <MaterialDeleteModal
        item={deleteModalItem}
        onClose={() => setDeleteModalItem(null)}
        onConfirm={confirmDeleteItem}
      />

      {/* ── 详情 Drawer ── */}
      <MaterialDrawer
        item={drawerItem}
        tagPathMap={tagPathMap}
        onClose={() => setDrawerItem(null)}
      />
    </div>
  );
};

export default MaterialManagement;
