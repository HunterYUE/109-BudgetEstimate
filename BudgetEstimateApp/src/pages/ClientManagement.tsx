import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Table, Tag, Button, Space, message, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EyeOutlined, EditOutlined,
} from '@ant-design/icons';
import { clientService } from '../services/clientService';
import type { Client, Contact, ClientGrade, CreditLevel } from '../types';
import { COLORS, LABEL_CELL_STYLE } from '../styles/colors';
import {
  INDUSTRIES, REGIONS,
  gradeConfig, creditConfig, AREA_CODES, generateClientCode,
} from '../components/client/clientConstants';
import { ClientEditModal, ClientSubModal } from '../components/client/ClientModals';
import ClientDrawer from '../components/client/ClientDrawer';
import { todayBeijing } from '../utils/timeFormat';
import { LIST_LIMIT } from '../utils/constants';
import { BARE_INPUT_STYLE } from '../utils/tableUtils';
import { useAuth } from '../utils/authContext';
import { hasPermission } from '../utils/permissions';

// ── 组件 ──

const ClientManagement: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [messageApi, msgContextHolder] = message.useMessage();
  const { modal } = App.useApp(); // ⚠️ B24：静态 Modal.confirm 消费 antd 主题上下文
  const { user } = useAuth();
  // ⚠️ A1 复核：写动作需「新建客户」权限（与后端 writeGuard 同源）；无写权用户隐藏 新建客户/编辑 按钮，仅可查看
  const canWrite = hasPermission(user?.permissions, ['新建客户', '全部查看权限']);

  const [contactCounts, setContactCounts] = useState<Record<string, number>>({});

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const [data, counts] = await Promise.all([
        // ⚠️ 传 limit:'1000'，避免后端默认 limit=100 导致列表截断
        clientService.list({ limit: LIST_LIMIT }),
        clientService.getContactCounts().catch(() => ({}) as Record<string, number>),
      ]);
      setClients(data);
      setContactCounts(counts);
    } catch (err: unknown) {
      messageApi.error('加载客户数据失败：' + ((err as Error).message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editRequestRef = useRef(0); // ⚠️ B5：编辑请求自增号，丢弃过期 getDetail 结果
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [editContacts, setEditContacts] = useState<Contact[]>([]);

  // 新增子公司弹窗
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

  const [editCity, setEditCity] = useState('SH');

  const areaCode = AREA_CODES[editForm.region || ''] || 'EA';
  const currentGrade = editForm.creditLevel || 'B';

  // 当等级/区域/城市变化时自动生成编码
  useEffect(() => {
    if (!editingId && editForm.code !== undefined) {
      const newCode = generateClientCode(currentGrade, areaCode, editCity, clients.map(c => c.code));
      setEditForm(p => ({ ...p, code: newCode }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGrade, areaCode, editCity, editingId]);

  const openEdit = useCallback(async (client: Client) => {
    // ⚠️ B5 修复：快速连点不同客户时，前一次 getDetail 的异步结果晚到会覆盖后一次的表单。
    // 用自增请求号标记最新一次请求，过期结果直接丢弃。
    const reqId = ++editRequestRef.current;
    setEditingId(client.id);
    // 从编码解析城市
    const codeMatch = client.code?.match(/^(?:[ABC]-)?([A-Z]{2})-([A-Z]{2,4})-\d{4}$/);
    if (codeMatch) setEditCity(codeMatch[2]);
    // 获取完整数据（含联系人）
    let detail = client;
    try { detail = await clientService.getDetail(client.id); } catch { /* 详情加载失败时回退列表数据 */ }
    if (reqId !== editRequestRef.current) return; // ⚠️ 已有更新的编辑请求，丢弃本次过期结果
    setEditForm({
      code: detail.code,
      name: detail.name,
      type: detail.type,
      parentId: detail.parentId,
      industry: detail.industry,
      region: detail.region,
      salesman: detail.salesman,
      creditLevel: detail.creditLevel,
      grade: detail.grade,
    });
    setEditContacts((detail.contacts || []).map((c: Contact) => ({ ...c })));
    setEditOpen(true);
  }, []);

  const openNewEnterprise = () => {
    setEditingId(null);
    setEditCity('SH');
    const newCode = generateClientCode('B', AREA_CODES['东区'] || 'EA', 'SH', clients.map(c => c.code));
    setEditForm({
      code: newCode,
      name: '新客户',
      type: 'enterprise',
      parentId: undefined,
      industry: '其他',
      region: '东区',
      salesman: '',  // 销售员从客户管理维护，不硬编码
      creditLevel: 'B',
      grade: 'B',
      createdAt: todayBeijing(),
    });
    setEditContacts([]);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm.code) { messageApi.warning('请输入客户编号'); return; }
    if (!editForm.name) { messageApi.warning('请输入客户名称'); return; }
    const dupName = clients.find(c => c.name === editForm.name && c.id !== editingId);
    if (dupName) { messageApi.warning('已存在同名客户：' + dupName.name + '（' + dupName.code + '）'); return; }
    try {
      if (editingId) {
        const saved = await clientService.saveWithContacts(editingId, {
          code: editForm.code,
          name: editForm.name,
          industry: editForm.industry,
          region: editForm.region,
          salesman: editForm.salesman,
          creditLevel: editForm.creditLevel as CreditLevel,
          grade: editForm.grade as ClientGrade,
          contacts: editContacts,
        });
        setClients(prev => prev.map(c =>
          c.id === editingId ? { ...c, contacts: saved.contacts } : c
        ));
        messageApi.success('保存成功');
      } else {
        const created = await clientService.create({
          code: editForm.code || '',
          name: editForm.name || '新客户',
          type: 'enterprise',
          parentId: undefined,
          industry: editForm.industry || '其他',
          region: editForm.region || '东区',
          salesman: editForm.salesman || '',
          creditLevel: (editForm.creditLevel as CreditLevel) || 'B',
          grade: (editForm.grade as ClientGrade) || 'B',
        });
        if (editContacts.length > 0) {
          const saved = await clientService.saveWithContacts(created.id, {
            ...created,
            contacts: editContacts,
          });
          setClients(prev => prev.map(c =>
            c.id === created.id ? { ...c, contacts: saved.contacts } : c
          ));
        }
        messageApi.success('创建成功');
      }
      setEditOpen(false);
      await fetchClients();
    } catch (err: unknown) {
      messageApi.error('保存失败：' + ((err as Error).message || '未知错误'));
    }
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

  const saveSub = async () => {
    if (!subForm.name) { messageApi.warning('请输入子公司名称'); return; }
    const parent = clients.find(c => c.id === subParentId);
    if (!parent) { messageApi.error('未找到母公司'); return; }
    try {
      // ⚠️ B5 修复：自动生成子公司编码时去重——-SUB(n) 递增直到不与现存编码冲突
      //   （schema UNIQUE(code)，此前固定 -SUB 第二次添加即撞约束返 500）；手动填写的编码仍如实校验
      let subCode = (subForm.code || '').trim();
      if (!subCode) {
        const taken = new Set(clients.map(c => c.code));
        let n = 1;
        subCode = parent.code + '-SUB';
        while (taken.has(subCode)) subCode = parent.code + '-SUB' + (++n);
      }
      await clientService.create({
        code: subCode,
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
        createdAt: todayBeijing(),
      });
      setSubOpen(false);
      messageApi.success('子公司添加成功');
      await fetchClients();
    } catch (err: unknown) {
      messageApi.error('添加失败：' + ((err as Error).message || '未知错误'));
    }
  };

  // ── Delete subsidiary ──

  const deleteSubsidiary = (id: string) => {
    modal.confirm({
      title: '确认删除',
      content: '确定删除该子公司记录？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { style: { background: COLORS.primary, borderColor: COLORS.primary, borderRadius: 4 } },
      cancelButtonProps: { style: { borderRadius: 4 } },
      onOk: async () => {
        try {
          await clientService.delete(id);
          messageApi.success('已删除');
          await fetchClients();
        } catch (err: unknown) {
          messageApi.error('删除失败：' + ((err as Error).message || '未知错误'));
        }
      },
    });
  };

  // ── Column definitions ──

  const columns: ColumnsType<Client> = useMemo(() => [
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
      onFilter: (value: unknown, record: Client) => value === '__all__' || record.industry === value,
    },
    { title: '区域', dataIndex: 'region', width: 70,
      filters: [{ text: '全部', value: '__all__' }, ...REGIONS.map(r => ({ text: r, value: r }))],
      filterSearch: true,
      onFilter: (value: unknown, record: Client) => value === '__all__' || record.region === value,
    },
    { title: '区域销售', dataIndex: 'salesman', width: 80,
      filters: [{ text: '全部', value: '__all__' }, ...Array.from(new Set(clients.map(c => c.salesman).filter(Boolean))).map(s => ({ text: s, value: s }))],
      filterSearch: true,
      onFilter: (value: unknown, record: Client) => value === '__all__' || record.salesman === value,
    },
    {
      title: '信用等级', dataIndex: 'creditLevel', width: 80, align: 'center' as const,
      render: (v: string) => {
        const cfg = creditConfig[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color} style={{ borderRadius: 1 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '客户分级', dataIndex: 'grade', width: 75, align: 'center' as const,
      render: (v: ClientGrade) => {
        const cfg = gradeConfig[v] || { label: v, color: COLORS.textLight };
        return <Tag color={cfg.color} style={{ borderRadius: 1 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '联系人', key: 'contactCount', width: 65, align: 'center' as const,
      render: (_: unknown, record: Client) => <span>{contactCounts[record.id] ?? (record.contacts || []).length} 人</span>,
    },
    {
      title: '', key: 'action', width: 130, align: 'center' as const,
      render: (_: unknown, record: Client) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />}
            onClick={async () => {
              try {
                const detail = await clientService.getDetail(record.id);
                setDrawerClient(detail);
              } catch { setDrawerClient(record); }
            }}
            style={{ color: COLORS.primary, fontSize: 12 }}>详情</Button>
          {canWrite && (
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={() => openEdit(record)}
              style={{ color: COLORS.primary, fontSize: 12 }}>编辑</Button>
          )}
        </Space>
      ),
    },
  ], [clients, contactCounts, canWrite, openEdit]);

  // ── Render ──

  return (
    <div>
      {msgContextHolder}
      <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark, marginBottom: 4 }}>客户管理</div>
      <div style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16 }}>&nbsp;</div>

      {/* 搜索 + 筛选栏 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <colgroup>
          <col width="44" /><col width="auto" /><col width="44" /><col width="110" /><col width="44" /><col width="90" /><col width="84" />
        </colgroup>
        <tbody>
          <tr>
            <td style={LABEL_CELL_STYLE}>搜索</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <input placeholder="搜索客户名称 / 编号"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: '100%', ...BARE_INPUT_STYLE, fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
            <td style={LABEL_CELL_STYLE}>行业</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                onClick={() => {
                  const opts = ['', ...INDUSTRIES];
                  const cur = opts.indexOf(industryFilter || '');
                  setIndustryFilter(opts[(cur + 1) % opts.length]);
                }}>
                {industryFilter || '全部'} ▾
              </span>
            </td>
            <td style={LABEL_CELL_STYLE}>分级</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                onClick={() => {
                  const opts = ['', 'A', 'B', 'C'];
                  const cur = opts.indexOf(gradeFilter || '');
                  setGradeFilter(opts[(cur + 1) % opts.length]);
                }}>
                {gradeFilter ? gradeFilter + ' 类' : '全部'} ▾
              </span>
            </td>
            <td style={{ padding: 0, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle', textAlign: 'center' }}>
              {canWrite && (
                <Button type="text" icon={<PlusOutlined />} onClick={openNewEnterprise}
                  style={{ color: COLORS.primary, fontSize: 18, width: 42, height: 42 }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>&nbsp;</div>

      {/* 树形表格 */}
      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <Table
        dataSource={treeData}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        scroll={{ x: 1030 }}
        bordered
        loading={loading}
        style={{ background: '#fff', borderRadius: 8 }}
      />
      </div>

      {/* ── 编辑客户 Modal ── */}
      <ClientEditModal
        open={editOpen}
        editingId={editingId}
        editForm={editForm}
        editContacts={editContacts}
        editCity={editCity}
        clients={clients}
        onClose={() => setEditOpen(false)}
        onFormChange={patch => setEditForm(p => ({ ...p, ...patch }))}
        onCityChange={setEditCity}
        onAddContact={addEmptyContactRow}
        onUpdateContact={updateContactField}
        onRemoveContact={removeContact}
        onSave={saveEdit}
        onAddSubsidiary={openAddSub}
        onEditClient={openEdit}
        onDeleteSubsidiary={deleteSubsidiary}
      />

      {/* ── 新增子公司 Modal ── */}
      <ClientSubModal
        open={subOpen}
        subParentId={subParentId}
        subForm={subForm}
        clients={clients}
        onClose={() => setSubOpen(false)}
        onFormChange={patch => setSubForm(p => ({ ...p, ...patch }))}
        onSave={saveSub}
      />

      {/* ── 详情 Drawer ── */}
      <ClientDrawer
        drawerClient={drawerClient}
        clients={clients}
        onClose={() => setDrawerClient(null)}
      />
    </div>
  );
};

export default ClientManagement;
