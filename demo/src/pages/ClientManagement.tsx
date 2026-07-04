import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Drawer, Modal, Space, message, Popover } from 'antd';
import {
  PlusOutlined, EyeOutlined, EditOutlined,
  PhoneOutlined, MailOutlined, DeleteOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import { mockClients, mockQuotationSummaries } from '../mockData';
import { formatMoney } from '../utils/calculations';
import type { Client, Contact, ClientGrade, CreditLevel } from '../types';
import { COLORS } from '../styles/constants';

// ── 常量 ──

const gradeConfig: Record<ClientGrade, { label: string; color: string }> = {
  A: { label: 'A 类', color: COLORS.success },
  B: { label: 'B 类', color: '#d46b08' },
  C: { label: 'C 类', color: COLORS.danger },
};

const creditConfig: Record<string, { label: string; color: string }> = {
  A: { label: '优', color: COLORS.success },
  B: { label: '良', color: '#d46b08' },
  C: { label: '差', color: COLORS.danger },
};

const roleColors: Record<string, string> = {
  使用: COLORS.primary, 技术: '#5a2d82', 商务: '#e65100', 高层: COLORS.danger,
};

const INDUSTRIES = [
  '安防/物联网', '半导体', '船舶制造', '电气控制', '电力电气',
  '工程机械','计算机制造', '建筑幕墙', '家居家具',
  '家电制造', '农业机械', '汽车制造', '设备制造', '数据中心', '新能源电池',
  '新能源汽车', '其他',
];
const REGIONS = ['东区', '南区', '北区'];
const SALESPEOPLE = ['张明', '李华', '王芳', '陈伟'];

// ── 行业下拉选择器（Popover 实现，样式与点击选择器一致） ──

const IndustryDropdown: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search ? INDUSTRIES.filter(i => i.includes(search)) : INDUSTRIES;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      styles={{ body: { padding: 0 } }}
      content={
        <div style={{ width: 180 }}>
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch(''); }
              if (e.key === 'Enter' && filtered.length > 0) { onChange(filtered[0]); setOpen(false); setSearch(''); }
            }}
            placeholder="搜索行业…"
            style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            autoFocus
          />
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px', fontSize: 12, color: '#999', textAlign: 'center' }}>无匹配</div>
            ) : filtered.map(i => (
              <div key={i}
                onClick={() => { onChange(i); setOpen(false); setSearch(''); }}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  background: i === value ? '#f0f6ff' : '#fff', color: i === value ? COLORS.primary : '#333',
                  borderBottom: '1px solid #f5f5f5',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                onMouseLeave={e => e.currentTarget.style.background = i === value ? '#f0f6ff' : '#fff'}
              >{i}</div>
            ))}
          </div>
        </div>
      }
    >
      <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, userSelect: 'none' }}>
        {value || '点击选择'} <span style={{ fontSize: 10 }}>▾</span>
      </span>
    </Popover>
  );
};

// ── 辅助函数 ──

function deepCloneClient(c: Client): Client {
  return { ...c, contacts: c.contacts.map(con => ({ ...con })) };
}

function makeId(): string {
  return 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// ── 组件 ──

const ClientManagement: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>(() =>
    mockClients.map(c => deepCloneClient(c))
  );
  const [searchText, setSearchText] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [messageApi, msgContextHolder] = message.useMessage();

  // salesNo → quotationId 查找映射
  const quotationLookup = useMemo(() => {
    const map = new Map<string, string>();
    mockQuotationSummaries.forEach(q => {
      map.set(q.salesNo, q.id);
    });
    return map;
  }, []);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [editContacts, setEditContacts] = useState<Contact[]>([]);

  // New contact fields in edit modal (inline editable, no separate form state needed)

  // Add subsidiary modal
  const [subOpen, setSubOpen] = useState(false);
  const [subParentId, setSubParentId] = useState('');
  const [subForm, setSubForm] = useState({ name: '', code: '', industry: '', region: '', salesman: '', creditLevel: 'B' as CreditLevel, grade: 'B' as ClientGrade });

  // ── 筛选逻辑 ──

  const matchesFilter = useMemo(() => {
    return (c: Client) => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const parent = clients.find(p => p.id === c.parentId);
        const displayName = c.type === 'subsidiary' && parent
          ? parent.name + c.name : c.name;
        if (!c.name.toLowerCase().includes(q) &&
            !displayName.toLowerCase().includes(q) &&
            !c.code.toLowerCase().includes(q)) return false;
      }
      if (industryFilter && c.industry !== industryFilter) return false;
      if (gradeFilter && c.grade !== gradeFilter) return false;
      return true;
    };
  }, [clients, searchText, industryFilter, gradeFilter]);

  const treeData = useMemo(() => {
    // Enterprises whose parent matches, or that have matching children
    const childMatchParentIds = new Set(
      clients.filter(c => c.type === 'subsidiary' && matchesFilter(c)).map(c => c.parentId)
    );
    return clients
      .filter(c => c.type === 'enterprise' && (matchesFilter(c) || childMatchParentIds.has(c.id)))
      .map(ent => ({
        ...ent,
        children: clients.filter(c => c.parentId === ent.id && matchesFilter(c)),
      }));
  }, [clients, matchesFilter]);

  // ── Contact helpers ──

  const removeContact = (id: string) => {
    setEditContacts(prev => prev.filter(c => c.id !== id));
  };

  const updateContactField = (id: string, field: keyof Contact, value: string | number | boolean) => {
    setEditContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addEmptyContactRow = () => {
    const newCon: Contact = {
      id: 'con-' + Date.now().toString(36),
      name: '',
      position: '',
      phone: '',
      email: '',
      decisionRole: '使用',
      superior: '',
    };
    setEditContacts(prev => [...prev, newCon]);
  };

  // ── Edit handlers ──

  const openEdit = (client: Client) => {
    setEditingId(client.id);
    setEditForm({
      code: client.code,
      name: client.name,
      type: client.type,
      parentId: client.parentId,
      industry: client.industry,
      region: client.region,
      salesman: client.salesman,
      creditLevel: client.creditLevel,
      grade: client.grade,
    });
    setEditContacts(client.contacts.map(c => ({ ...c })));
    setEditOpen(true);
  };

  const openNewEnterprise = () => {
    setEditingId(null);
    const now = new Date().toISOString().slice(0, 10);
    setEditForm({
      code: '',
      name: '新客户',
      type: 'enterprise',
      parentId: undefined,
      industry: '其他',
      region: '东区',
      salesman: '张明',
      creditLevel: 'B',
      grade: 'B',
      createdAt: now,
    });
    setEditContacts([]);
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editForm.code) { messageApi.warning('请输入客户编号'); return; }
    if (!editForm.name) { messageApi.warning('请输入客户名称'); return; }
    const now = new Date().toISOString().slice(0, 10);
    if (editingId) {
      setClients(prev => prev.map(c => {
        if (c.id !== editingId) return c;
        return {
          ...c,
          code: editForm.code || c.code,
          name: editForm.name || c.name,
          industry: editForm.industry || c.industry,
          region: editForm.region || c.region,
          salesman: editForm.salesman || c.salesman,
          creditLevel: (editForm.creditLevel as CreditLevel) || c.creditLevel,
          grade: (editForm.grade as ClientGrade) || c.grade,
          contacts: editContacts,
          updatedAt: now,
        };
      }));
    } else {
      const newClient: Client = {
        id: makeId(),
        code: editForm.code || '',
        name: editForm.name || '新客户',
        type: 'enterprise',
        industry: editForm.industry || '其他',
        region: editForm.region || '东区',
        salesman: editForm.salesman || '',
        creditLevel: (editForm.creditLevel as CreditLevel) || 'B',
        grade: (editForm.grade as ClientGrade) || 'B',
        contacts: editContacts,
        history: [],
        createdAt: now,
      };
      setClients(prev => [...prev, newClient]);
    }
    setEditOpen(false);
    messageApi.success('保存成功');
  };

  // ── Subsidiary handlers ──

  const openAddSub = (parentId: string) => {
    setSubParentId(parentId);
    const parent = clients.find(c => c.id === parentId);
    setSubForm({
      name: '',
      code: '',
      industry: parent?.industry || '其他',
      region: parent?.region || '东区',
      salesman: parent?.salesman || '',
      creditLevel: 'B',
      grade: 'B',
    });
    setSubOpen(true);
  };

  const saveSub = () => {
    if (!subForm.name) { messageApi.warning('请输入子公司名称'); return; }
    const parent = clients.find(c => c.id === subParentId);
    if (!parent) { messageApi.error('未找到母公司'); return; }
    const now = new Date().toISOString().slice(0, 10);
    const newSub: Client = {
      id: makeId(),
      code: subForm.code || parent.code + '-SUB',
      name: subForm.name,
      type: 'subsidiary',
      parentId: subParentId,
      industry: subForm.industry || parent.industry,
      region: subForm.region || parent.region,
      salesman: subForm.salesman || parent.salesman,
      creditLevel: subForm.creditLevel as CreditLevel,
      grade: subForm.grade as ClientGrade,
      contacts: [],
      history: [],
      createdAt: now,
    };
    setClients(prev => [...prev, newSub]);
    setSubOpen(false);
    messageApi.success('子公司添加成功');
  };

  // ── Delete subsidiary ──

  const deleteSubsidiary = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除该子公司记录？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { style: { background: COLORS.primary, borderColor: COLORS.primary, borderRadius: 4 } },
      cancelButtonProps: { style: { borderRadius: 4 } },
      onOk: () => {
        setClients(prev => prev.filter(c => c.id !== id));
        messageApi.success('已删除');
      },
    });
  };

  // ── Column definitions ──

  const columns: any[] = [  // eslint-disable-line @typescript-eslint/no-explicit-any
    {
      title: '客户名称', dataIndex: 'name', width: 280,
      render: (v: string, record: Client) => {
        if (record.type === 'enterprise') {
          return <span style={{ color: COLORS.primary }}><span style={{ marginRight: 6 }}>🏢</span>{v}</span>;
        }
        const parent = clients.find(c => c.id === record.parentId);
        return (
          <span style={{ color: '#555', fontSize: 12 }}>
            {parent?.name}（{v}）
          </span>
        );
      },
    },
    { title: '编号', dataIndex: 'code', width: 140,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '行业', dataIndex: 'industry', width: 110,
      filters: [{ text: '全部', value: '__all__' }, ...INDUSTRIES.map(i => ({ text: i, value: i }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Client) => value === '__all__' || record.industry === value,
    },
    { title: '区域', dataIndex: 'region', width: 70,
      filters: [{ text: '全部', value: '__all__' }, ...REGIONS.map(r => ({ text: r, value: r }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Client) => value === '__all__' || record.region === value,
    },
    { title: '区域销售', dataIndex: 'salesman', width: 80,
      filters: [{ text: '全部', value: '__all__' }, ...SALESPEOPLE.map(s => ({ text: s, value: s }))],
      filterSearch: true,
      filterDropdownProps: { minOverlayWidthMatchTrigger: false },
      onFilter: (value: string, record: Client) => value === '__all__' || record.salesman === value,
    },
    {
      title: '信用等级', dataIndex: 'creditLevel', width: 80, align: 'center' as const,
      render: (v: string) => {
        const cfg = creditConfig[v] || { label: v, color: '#999' };
        return <Tag color={cfg.color} style={{ borderRadius: 1 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '客户分级', dataIndex: 'grade', width: 75, align: 'center' as const,
      render: (v: ClientGrade) => {
        const cfg = gradeConfig[v] || { label: v, color: '#999' };
        return <Tag color={cfg.color} style={{ borderRadius: 1 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '联系人', key: 'contactCount', width: 65, align: 'center' as const,
      render: (_: unknown, record: Client) => <span>{record.contacts.length} 人</span>,
    },
    {
      title: '', key: 'action', width: 130, align: 'center' as const,
      render: (_: unknown, record: Client) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />}
            onClick={() => setDrawerClient(record)}
            style={{ color: COLORS.primary, fontSize: 12 }}>详情</Button>
          <Button type="text" size="small" icon={<EditOutlined />}
            onClick={() => openEdit(record)}
            style={{ color: COLORS.primary, fontSize: 12 }}>编辑</Button>
        </Space>
      ),
    },
  ];

  // ── Drawer content ──

  const renderDrawerContent = (client: Client) => {
    const parent = client.parentId ? clients.find(c => c.id === client.parentId) : null;

    const sectionHeader = (title: string, count?: number) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.3 }}>{title}</span>
        {count !== undefined && <span style={{ fontSize: 12, color: '#667085' }}>（{count}）</span>}
      </div>
    );

    const infoRow = (label: string, value: React.ReactNode) => (
      <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#667085', fontSize: 12, width: 80, flexShrink: 0 }}>{label}</span>
        <span style={{ color: '#1a2234', fontSize: 13, fontWeight: 500 }}>{value}</span>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── 基本信息卡片 ── */}
        <div style={{
          background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('基本信息')}
          {client.type === 'subsidiary' && parent && infoRow('母公司', parent.name)}
          {infoRow('行业', client.industry)}
          {infoRow('区域', client.region)}
          {infoRow('区域销售', client.salesman)}
          {infoRow('信用等级', (
            <Tag color={creditConfig[client.creditLevel]?.color || '#999'}
              style={{ borderRadius: 1, margin: 0, fontSize: 12, lineHeight: '20px' }}>
              {creditConfig[client.creditLevel]?.label}
            </Tag>
          ))}
          {infoRow('创建日期', client.createdAt)}
        </div>

        {/* ── 联系人卡片 ── */}
        <div style={{
          background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('联系人', client.contacts.length)}
          {client.contacts.length > 0 ? (
            <Table
              dataSource={client.contacts}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
              style={{ background: '#fff', borderRadius: 3 }}
              columns={[
                {
                  title: '联系人', key: 'contact', width: 130,
                  render: (_: unknown, c: Contact) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 3,
                        background: '#eef4ff', color: COLORS.primary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1b2a' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#667085' }}>{c.position}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  title: '汇报人', dataIndex: 'superior', width: 80,
                  render: (v: string) => <span style={{ fontSize: 12, color: '#667085' }}>{v || '—'}</span>,
                },
                {
                  title: '电话', dataIndex: 'phone', width: 130,
                  render: (v: string) => (
                    <span style={{ fontSize: 12, color: '#333' }}>
                      <PhoneOutlined style={{ marginRight: 4, fontSize: 11, color: '#b0b8c4' }} />{v}
                    </span>
                  ),
                },
                {
                  title: '邮箱', dataIndex: 'email', width: 170,
                  render: (v: string) => (
                    <span style={{ fontSize: 12, color: '#333' }}>
                      <MailOutlined style={{ marginRight: 4, fontSize: 11, color: '#b0b8c4' }} />{v}
                    </span>
                  ),
                },
                {
                  title: '角色', dataIndex: 'decisionRole', width: 60, align: 'center' as const,
                  render: (v: string) => (
                    <Tag color={roleColors[v] || '#999'} style={{ borderRadius: 1, fontSize: 11, lineHeight: '20px', margin: 0 }}>
                      {v}
                    </Tag>
                  ),
                },
              ]}
            />
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无联系人</div>
          )}
        </div>

        {/* ── 历史报价记录卡片 ── */}
        <div style={{
          background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
          padding: '20px 24px',
        }}>
          {sectionHeader('历史报价记录')}
          {client.history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {client.history.map(h => {
                const qId = quotationLookup.get(h.salesNo);
                const clickable = !!qId;
                return (
                  <div key={h.id} onClick={() => clickable && navigate('/quotations/' + qId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#fff', border: '1px solid #eef2f6', borderRadius: 1,
                      padding: '10px 14px', fontSize: 13,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = '#f5f8ff'; }}
                    onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0d1b2a' }}>
                        {h.projectName}
                        {clickable && <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.primary }}>›</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#667085', marginTop: 1 }}>{h.salesNo}</div>
                    </div>
                    <div style={{ fontWeight: 600, color: '#0d1b2a', minWidth: 90, textAlign: 'right' }}>
                      &yen;{formatMoney(h.amount)}
                    </div>
                    {h.status === '赢' ? (
                      <Tag color={COLORS.success} style={{ borderRadius: 1, fontSize: 11, lineHeight: '20px' }}>赢单</Tag>
                    ) : h.status === '冻结' ? (
                      <Tag color="#d46b08" style={{ borderRadius: 1, fontSize: 11, lineHeight: '20px' }}>冻结</Tag>
                    ) : (
                      <Tag color={COLORS.danger} style={{ borderRadius: 1, fontSize: 11, lineHeight: '20px' }}>输单</Tag>
                    )}
                    <span style={{ fontSize: 12, color: '#667085', minWidth: 80, textAlign: 'center' }}>{h.date}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无历史记录</div>
          )}
        </div>
      </div>
    );
  };

  // ── Render ──

  return (
    <div>
      {msgContextHolder}
      <div style={{ fontSize: 17, fontWeight: 700, color: '#0d1b2a', marginBottom: 4 }}>客户管理</div>
      <div style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>&nbsp;</div>

      {/* 搜索 + 筛选栏 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <colgroup>
          <col width="44" /><col width="auto" /><col width="44" /><col width="110" /><col width="44" /><col width="90" /><col width="84" />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>搜索</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
              <input placeholder="搜索客户名称 / 编号"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>行业</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                onClick={() => {
                  const opts = ['', ...INDUSTRIES];
                  const cur = opts.indexOf(industryFilter || '');
                  setIndustryFilter(opts[(cur + 1) % opts.length]);
                }}>
                {industryFilter || '全部'} ▾
              </span>
            </td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>分级</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                onClick={() => {
                  const opts = ['', 'A', 'B', 'C'];
                  const cur = opts.indexOf(gradeFilter || '');
                  setGradeFilter(opts[(cur + 1) % opts.length]);
                }}>
                {gradeFilter ? gradeFilter + ' 类' : '全部'} ▾
              </span>
            </td>
            <td style={{ padding: 0, border: '1px solid #e8e8e8', verticalAlign: 'middle', textAlign: 'center' }}>
              <Button type="text" icon={<PlusOutlined />} onClick={openNewEnterprise}
                style={{ color: COLORS.primary, fontSize: 18, width: 42, height: 42 }} />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>&nbsp;</div>

      {/* 树形表格 */}
      <Table
        dataSource={treeData}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        style={{ background: '#fff', borderRadius: 3 }}
      />

      {/* ── 编辑模态框 ── */}
      <Modal
        title={
          <span style={{ fontSize: 17, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.5 }}>
            {editingId ? '编辑客户' : '新增客户'}
          </span>
        }
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        width={860}
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
        {/* ── 基本信息卡片 ── */}
        <div style={{
          background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
          padding: '20px 24px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.3 }}>基本信息</span>
            {editForm.type === 'subsidiary' && editingId && (
              <span style={{ fontSize: 12, color: '#667085', marginLeft: 'auto' }}>
                隶属于：{clients.find(c => c.id === editForm.parentId)?.name || ''}
              </span>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col width="80" /><col width="1*" /><col width="80" /><col width="1*" />
            </colgroup>
            <tbody>
              <tr>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>客户名称</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <input value={editForm.name || ''}
                    onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    disabled={editForm.type === 'subsidiary' && !!editingId}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                </td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>客户编号</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <input value={editForm.code || ''}
                    onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>行业</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <IndustryDropdown value={editForm.industry} onChange={val => setEditForm(p => ({ ...p, industry: val }))} />
                </td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>区域</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                    onClick={() => {
                      const cur = REGIONS.indexOf(editForm.region || '');
                      setEditForm(p => ({ ...p, region: REGIONS[(cur + 1) % REGIONS.length] }));
                    }}>
                    {editForm.region || '点击选择'} ▾
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>区域销售</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <input value={editForm.salesman || ''}
                    onChange={e => setEditForm(p => ({ ...p, salesman: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                </td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>信用等级</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                    onClick={() => {
                      const levels: CreditLevel[] = ['A', 'B', 'C'];
                      const cur = levels.indexOf(editForm.creditLevel as CreditLevel);
                      setEditForm(p => ({ ...p, creditLevel: levels[(cur + 1) % levels.length] }));
                    }}>
                    {editForm.creditLevel || '点击选择'} ▾
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>客户分级</td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                    onClick={() => {
                      const grades: ClientGrade[] = ['A', 'B', 'C'];
                      const cur = grades.indexOf(editForm.grade as ClientGrade);
                      setEditForm(p => ({ ...p, grade: grades[(cur + 1) % grades.length] }));
                    }}>
                    {editForm.grade || '点击选择'} ▾
                  </span>
                </td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}></td>
                <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 联系人卡片 ── */}
        <div style={{
          background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
          padding: '20px 24px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.3 }}>联系人</span>
            <span style={{ fontSize: 12, color: '#667085' }}>（{editContacts.length}）</span>
          </div>

          {/* 联系人表格（可编辑） */}
          <Table
            dataSource={editContacts}
            rowKey="id"
            pagination={false}
            size="small"
            bordered
            scroll={{ x: 705 }}
            style={{ background: '#fff', borderRadius: 3 }}
            columns={[
              {
                title: '联系人', key: 'contact', width: 180,
                onCell: () => ({ style: { width: 180, minWidth: 180, maxWidth: 180 } }),
                render: (_: unknown, c: Contact) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 3,
                      background: '#eef4ff', color: COLORS.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {c.name ? c.name.charAt(0) : '?'}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <input value={c.name}
                        onChange={e => updateContactField(c.id, 'name', e.target.value)}
                        placeholder="姓名"
                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600, color: '#0d1b2a', padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                      <input value={c.position}
                        onChange={e => updateContactField(c.id, 'position', e.target.value)}
                        placeholder="职位"
                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 11, color: '#667085', padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                ),
              },
              {
                title: '汇报人', dataIndex: 'superior', width: 90,
                onCell: () => ({ style: { width: 90, minWidth: 90, maxWidth: 90 } }),
                render: (v: string, c: Contact) => (
                  <input value={v || ''}
                    onChange={e => updateContactField(c.id, 'superior', e.target.value)}
                    placeholder="—"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: '#667085', padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                ),
              },
              {
                title: '电话', dataIndex: 'phone', width: 131,
                onCell: () => ({ style: { width: 131, minWidth: 131, maxWidth: 131 } }),
                render: (v: string, c: Contact) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <PhoneOutlined style={{ fontSize: 11, color: '#b0b8c4', flexShrink: 0 }} />
                    <input value={v || ''}
                      onChange={e => updateContactField(c.id, 'phone', e.target.value)}
                      placeholder="电话"
                      style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: '#333', padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                  </span>
                ),
              },
              {
                title: '邮箱', dataIndex: 'email', width: 174,
                onCell: () => ({ style: { width: 174, minWidth: 174, maxWidth: 174 } }),
                render: (v: string, c: Contact) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MailOutlined style={{ fontSize: 11, color: '#b0b8c4', flexShrink: 0 }} />
                    <input value={v || ''}
                      onChange={e => updateContactField(c.id, 'email', e.target.value)}
                      placeholder="邮箱"
                      style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: '#333', padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                  </span>
                ),
              },
              {
                title: '角色', dataIndex: 'decisionRole', width: 90, align: 'center' as const,
                onCell: () => ({ style: { width: 90, minWidth: 90, maxWidth: 90 } }),
                render: (v: string, c: Contact) => (
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                    onClick={() => {
                      const roles: Contact['decisionRole'][] = ['使用', '技术', '商务', '高层'];
                      const cur = roles.indexOf(v as Contact['decisionRole']);
                      updateContactField(c.id, 'decisionRole', roles[(cur + 1) % roles.length]);
                    }}>
                    {v || '点击选择'} ▾
                  </span>
                ),
              },
              {
                title: '', key: 'action', width: 40, align: 'center' as const,
                onCell: () => ({ style: { width: 40, minWidth: 40, maxWidth: 40 } }),
                render: (_: unknown, c: Contact) => (
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => removeContact(c.id)} />
                ),
              },
            ]}
          />

          {/* 新增联系人按钮 */}
          <Button type="dashed" icon={<PlusOutlined />} onClick={addEmptyContactRow}
            style={{ width: '100%', color: COLORS.primary, borderColor: COLORS.primary, borderRadius: 3, height: 32, fontSize: 13, marginTop: 14 }}>
            新增联系人
          </Button>
        </div>

        {/* ── 子公司卡片（仅企业类型） ── */}
        {((editingId && editForm.type === 'enterprise') || (!editingId && editForm.type === 'enterprise')) && (
          <div style={{
            background: '#fafcff', border: '1px solid #e8edf4', borderRadius: 5,
            padding: '20px 24px', marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.3 }}>子公司</span>
              {(() => {
                const subs = clients.filter(c => c.parentId === editingId);
                return <span style={{ fontSize: 12, color: '#667085' }}>（{subs.length}）</span>;
              })()}
            </div>

            {(() => {
              const subs = clients.filter(c => c.parentId === editingId);
              return subs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {subs.map(sub => (
                    <div key={sub.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#fff', border: '1px solid #eef2f6', borderRadius: 1,
                      padding: '8px 12px', fontSize: 13,
                    }}>
                      <span style={{ fontSize: 11, color: '#b0b8c4' }}>└─</span>
                      <span style={{ fontWeight: 500, color: '#0d1b2a' }}>{editForm.name}（{sub.name}）</span>
                      <span style={{ color: '#667085', fontSize: 12 }}>{sub.code}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                        <Button type="text" size="small" icon={<EditOutlined />}
                          onClick={() => { setSubOpen(false); openEdit(sub); }}
                          style={{ color: COLORS.primary, fontSize: 12 }} />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />}
                          onClick={() => deleteSubsidiary(sub.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#b0b8c4', marginBottom: 14, textAlign: 'center', padding: 6 }}>
                  暂无子公司
                </div>
              );
            })()}

            <Button type="dashed" icon={<PlusOutlined />}
              onClick={() => editingId && openAddSub(editingId)}
              style={{ width: '100%', color: COLORS.primary, borderColor: COLORS.primary, borderRadius: 1, height: 36, fontSize: 13 }}>
              新增子公司
            </Button>
          </div>
        )}
      </Modal>

      {/* ── 新增子公司模态框 ── */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: '#0d1b2a', letterSpacing: 0.5 }}>新增子公司</span>}
        open={subOpen}
        onCancel={() => setSubOpen(false)}
        width={860}
        destroyOnHidden
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setSubOpen(false)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} onClick={saveSub}
              style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          母公司：{clients.find(c => c.id === subParentId)?.name}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col width="80" /><col width="1*" /><col width="80" /><col width="1*" />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>子公司名称</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <input value={subForm.name}
                  onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="输入简称"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>编号</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <input value={subForm.code}
                  onChange={e => setSubForm(p => ({ ...p, code: e.target.value }))}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>行业</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <IndustryDropdown value={subForm.industry} onChange={val => setSubForm(p => ({ ...p, industry: val }))} />
              </td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>区域</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                  onClick={() => {
                    const cur = REGIONS.indexOf(subForm.region || '');
                    setSubForm(p => ({ ...p, region: REGIONS[(cur + 1) % REGIONS.length] }));
                  }}>
                  {subForm.region || '点击选择'} ▾
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>区域销售</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <input value={subForm.salesman || ''}
                  onChange={e => setSubForm(p => ({ ...p, salesman: e.target.value }))}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>信用等级</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                  onClick={() => {
                    const levels: CreditLevel[] = ['A', 'B', 'C'];
                    const cur = levels.indexOf(subForm.creditLevel as CreditLevel);
                    setSubForm(p => ({ ...p, creditLevel: levels[(cur + 1) % levels.length] }));
                  }}>
                  {subForm.creditLevel || '点击选择'} ▾
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}>客户分级</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                  onClick={() => {
                    const grades: ClientGrade[] = ['A', 'B', 'C'];
                    const cur = grades.indexOf(subForm.grade as ClientGrade);
                    setSubForm(p => ({ ...p, grade: grades[(cur + 1) % grades.length] }));
                  }}>
                  {subForm.grade || '点击选择'} ▾
                </span>
              </td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle', fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap', color: '#1a2744' }}></td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e8e8e8', verticalAlign: 'middle' }}></td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
          显示为：{clients.find(c => c.id === subParentId)?.name}（{subForm.name || '...'}）
        </div>
      </Modal>

      {/* ── 详情 Drawer ── */}
      <Drawer
        title={
          drawerClient ? (
            <Space>
              {drawerClient.type === 'subsidiary' && <span style={{ fontSize: 12, color: '#999' }}>子公司</span>}
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0d1b2a' }}>
                {drawerClient.type === 'enterprise'
                  ? drawerClient.name
                  : (clients.find(c => c.id === drawerClient.parentId)?.name || '') + '（' + drawerClient.name + '）'
                }
              </span>
              <Tag color={gradeConfig[drawerClient.grade]?.color || '#999'} style={{ borderRadius: 1 }}>
                {gradeConfig[drawerClient.grade]?.label}
              </Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{drawerClient.code}</span>
            </Space>
          ) : ''
        }
        placement="right"
        onClose={() => setDrawerClient(null)}
        open={!!drawerClient}
        styles={{ wrapper: { width: 600 } }}
      >
        {drawerClient && renderDrawerContent(drawerClient)}
      </Drawer>
    </div>
  );
};

export default ClientManagement;
