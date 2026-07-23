import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Table, Button, Modal, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined, KeyOutlined, CheckOutlined, CloseOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { COLORS, LABEL_CELL_STYLE } from '../styles/colors';
import { formatBeijing } from '../utils/timeFormat';
import { userService, type UserRecord } from '../services/userService';
import { auditLogService, type AuditLog } from '../services/auditLogService';
import type { TableProps } from 'antd';

/** 新建用户的默认初始密码（建议用户在首次登录后修改） */
const DEFAULT_USER_PASSWORD = '123456';

/* ============================================================
   角色颜色映射
   ============================================================ */
const VAL_CELL_STYLE: React.CSSProperties = {
  padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`,
  verticalAlign: 'middle',
};

const INP_STYLE: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', outline: 'none',
  fontSize: 13, padding: '2px 0', margin: 0, display: 'block',
  boxSizing: 'border-box', lineHeight: 1.3,
};

type TabKey = 'users' | 'logs';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'logs', label: '操作日志' },
];

/* ============================================================
   角色权限模板
   ============================================================ */
const ALL_PERMISSIONS = [
  '仪表盘查看', '销售机会管理', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会',
  '销售蓝表编辑', '报价列表查看', '报价编制', '审批管理', '交付管理', '交付分析',
  '成本录入', '物料管理', '新增物料', '新建标签', '客户管理', '新建客户',
  '用户管理', '系统配置', '全部查看权限',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: ['销售机会管理', '报价列表查看', '销售分析', '客户管理', '仪表盘查看'],
  manager: ['交付管理', '交付分析', '成本录入', '物料管理', '仪表盘查看', '报价列表查看', '销售机会管理', '客户管理'],
  admin: ['审批管理', '用户管理', '系统配置', '全部查看权限', '仪表盘查看', '销售机会管理', '报价编制', '物料管理', '交付管理', '客户管理'],
  director: ['审批管理', '用户管理', '系统配置', '全部查看权限', '仪表盘查看', '销售机会管理', '报价编制', '物料管理', '交付管理', '客户管理', '新增物料', '新建标签', '新建客户', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会', '销售蓝表编辑', '交付分析', '成本录入'],
};

/* ============================================================
   Component
   ============================================================ */

const TITLE_PERMISSIONS: Record<string, string[]> = {
  '销售经理': ['销售机会管理', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会', '销售蓝表编辑', '客户管理', '新建客户', '报价列表查看', '仪表盘查看'],
  '方案经理': ['物料管理', '新增物料', '新建标签', '报价编制', '报价列表查看', '仪表盘查看', '销售机会管理', '客户管理'],
  '交付经理': ['交付管理', '交付分析', '成本录入', '物料管理', '仪表盘查看', '报价列表查看', '销售机会管理', '客户管理'],
  '部门总监': ['全部查看权限', '审批管理', '用户管理', '系统配置', '仪表盘查看', '销售机会管理', '报价编制', '物料管理', '新增物料', '新建标签', '交付管理', '交付分析', '客户管理', '新建客户', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会', '销售蓝表编辑', '成本录入'],
};

/** 职务→角色映射（职务决定后端鉴权角色，用户无需手动选择） */
const TITLE_ROLE_MAP: Record<string, string> = {
  '部门总监': 'director',
  '销售经理': 'user',
  '方案经理': 'user',
  '交付经理': 'user',
};

const SystemManagement: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('users');
  const [messageApi, msgContextHolder] = message.useMessage();

  // 用户数据
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await userService.list();
      setUsers(data);
    } catch (err: unknown) {
      messageApi.error('加载用户列表失败：' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, []);

  // 弹窗状态
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);

  // 新增用户表单
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('销售经理');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // 编辑用户表单
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // 密码重置
  const [resetPwd, setResetPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // 角色权限
  const [permTitle, setPermTitle] = useState('');
  const [checkedPerms, setCheckedPerms] = useState<string[]>([]);

  // 操作日志
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [, setLogLoading] = useState(false);
  const [logModuleFilter, setLogModuleFilter] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const data = await auditLogService.list();
      setLogs(data);
    } catch {
      messageApi.error('加载操作日志失败');
    } finally {
      setLogLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, loadLogs]);

  /* ---- 用户管理操作 ---- */

  const toggleUserActive = async (user: UserRecord) => {
    try {
      const updated = await userService.update(user.id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (err: unknown) {
      messageApi.error('操作失败：' + (err.message || ''));
    }
  };

  const openAddModal = () => {
    setNewName(''); setNewTitle('销售经理');
    setNewPhone(''); setNewEmail('');
    setAddOpen(true);
  };

  const handleAddUser = async () => {
    if (!newName.trim()) { messageApi.warning('请输入用户姓名'); return; }
    if (!newEmail.trim()) { messageApi.warning('请输入邮箱'); return; }

    setSaving(true);
    try {
      const created = await userService.create({
        email: newEmail.trim(),
        displayName: newName.trim(),
        title: newTitle,
        phone: newPhone.trim(),
        password: DEFAULT_USER_PASSWORD,
        role: TITLE_ROLE_MAP[newTitle] || 'user',
      });
      // 为新用户初始化默认权限（基于选择的职务）
      const defaultPerms = TITLE_PERMISSIONS[newTitle] || [];
      await userService.updateRole(created.id, TITLE_ROLE_MAP[newTitle] || 'user', newTitle, defaultPerms).catch(() => {});
      setUsers(prev => [...prev, { ...created, permissions: defaultPerms }]);
      setAddOpen(false);
      messageApi.success(`用户 ${created.displayName} 添加成功（初始密码 ${DEFAULT_USER_PASSWORD}）`);
    } catch (err: unknown) {
      messageApi.error(err.message || '添加失败');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (u: UserRecord) => {
    setEditTarget(u);
    setEditName(u.displayName);
    setEditTitle(u.title);
    setEditPhone(u.phone || '');
    setEditEmail(u.email);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editEmail.trim()) { messageApi.warning('邮箱不能为空'); return; }

    setSaving(true);
    try {
      const updated = await userService.update(editTarget.id, {
        displayName: editName.trim(),
        email: editEmail.trim(),
        title: editTitle,
        phone: editPhone.trim(),
      });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setEditOpen(false);
      setEditTarget(null);
      messageApi.success('用户信息已更新');
    } catch (err: unknown) {
      messageApi.error(err.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const openPwdModal = (u: UserRecord) => {
    setEditTarget(u);
    setResetPwd(''); setConfirmPwd('');
    setPwdOpen(true);
  };

  const handlePwdReset = async () => {
    if (!editTarget) return;
    if (!resetPwd.trim()) { messageApi.warning('请输入新密码'); return; }
    if (resetPwd.length < 6) { messageApi.warning('密码长度不能少于6位'); return; }
    if (resetPwd !== confirmPwd) { messageApi.warning('两次输入的密码不一致'); return; }

    setSaving(true);
    try {
      await userService.resetPassword(editTarget.id, resetPwd);
      setPwdOpen(false);
      setEditTarget(null);
      messageApi.success('密码已重置');
    } catch (err: unknown) {
      messageApi.error(err.message || '密码重置失败');
    } finally {
      setSaving(false);
    }
  };


  const openPermModal = (u: UserRecord) => {
    setEditTarget(u);
    setPermTitle(u.title);
    // 优先使用数据库已保存的权限，否则用职务预设
    setCheckedPerms(u.permissions && u.permissions.length > 0
      ? [...u.permissions]
      : [...(TITLE_PERMISSIONS[u.title] || ROLE_PERMISSIONS[u.role] || [])]);
    setPermOpen(true);
  };

  const handlePermSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const updated = await userService.updateRole(editTarget.id, TITLE_ROLE_MAP[permTitle] || 'user', permTitle, checkedPerms);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setPermOpen(false);
      setEditTarget(null);
      messageApi.success('角色权限已更新');
    } catch (err: unknown) {
      messageApi.error(err.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await userService.delete(deleteTarget.id);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      messageApi.success('用户已删除');
    } catch (err: unknown) {
      messageApi.error(err.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  /* ---- 表格列 ---- */
  const userColumns: TableProps<UserRecord>['columns'] = [
    { title: '姓名', dataIndex: 'displayName', key: 'displayName', width: 100 },
    {
      title: '职务', dataIndex: 'title', key: 'title', width: 120,
      render: (v: string) => (
        <span style={{ color: COLORS.textDark, fontWeight: 500 }}>{v || '—'}</span>
      ),
    },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 150,
      render: (v: string) => <span style={{ color: COLORS.textDark }}>{v || '—'}</span>,
    },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 230 },
    {
      title: '状态', dataIndex: 'isActive', key: 'isActive', width: 70,
      render: (v: boolean, rec: UserRecord) => (
        <Switch checked={v} size="small" onChange={() => toggleUserActive(rec)}
          style={{ background: v ? COLORS.success : COLORS.borderInput }} />
      ),
    },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: unknown, rec: UserRecord) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span onClick={() => openEditModal(rec)}
            style={{ color: COLORS.primary, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            <EditOutlined style={{ marginRight: 2 }} />编辑
          </span>
          <span style={{ color: '#d0d0d0' }}>|</span>
          <span onClick={() => openPwdModal(rec)}
            style={{ color: COLORS.warning, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            <KeyOutlined style={{ marginRight: 2 }} />密码
          </span>
          <span style={{ color: '#d0d0d0' }}>|</span>
          <span onClick={() => openPermModal(rec)}
            style={{ color: COLORS.purple, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            <SettingOutlined style={{ marginRight: 2 }} />权限
          </span>
          <span style={{ color: '#d0d0d0' }}>|</span>
          <span onClick={() => setDeleteTarget(rec)}
            style={{ color: COLORS.danger, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            <DeleteOutlined style={{ marginRight: 2 }} />移除
          </span>
        </div>
      ),
    },
  ];

  /* ---- 操作日志 ---- */
  const logModules = useMemo(() => {
    const mods = new Set(logs.map(l => l.module));
    return ['全部', ...Array.from(mods)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logModuleFilter || logModuleFilter === '全部') return logs;
    return logs.filter(l => l.module === logModuleFilter);
  }, [logs, logModuleFilter]);

  const logColumns: TableProps<AuditLog>['columns'] = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 160,
      render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textDark }}>{formatBeijing(v)}</span>,
    },
    { title: '操作人', dataIndex: 'userName', key: 'userName', width: 100,
      render: (_: string, rec: any) => (
        <span style={{ color: COLORS.textDark, fontSize: 13 }}>{rec.displayName || rec.userName || '—'}</span>
      ),
    },
    { title: '模块', dataIndex: 'module', key: 'module', width: 88 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 88 },
    { title: '详情', dataIndex: 'detail', key: 'detail',
      render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{v}</span>,
    },
  ];


  return (
    <div>
      {msgContextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>系统管理</span>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `2px solid ${COLORS.border}` }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px', cursor: 'pointer', fontSize: 14,
              borderBottom: tab === t.key ? `2px solid ${COLORS.primary}` : '2px solid transparent',
              color: tab === t.key ? COLORS.primary : COLORS.textSecondary,
              fontWeight: tab === t.key ? 600 : 400,
              marginBottom: -2, transition: 'all 0.15s', userSelect: 'none',
            }}>{t.label}</div>
        ))}
      </div>

      {/* ================================================================
          用户管理
          ================================================================ */}
      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button type="default" ghost icon={<PlusOutlined />} onClick={openAddModal}
              style={{
                borderRadius: 8, border: `1.5px dashed ${COLORS.borderLight}`,
                color: COLORS.primary, fontSize: 13, fontWeight: 600, height: 32,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.primary}`; e.currentTarget.style.background = COLORS.bgSelected; }}
              onMouseLeave={e => { e.currentTarget.style.border = `1.5px dashed ${COLORS.borderLight}`; e.currentTarget.style.background = 'transparent'; }}
            >新增用户</Button>
          </div>

          <div style={{
            borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          }}>
          <Table<UserRecord>
            dataSource={users}
            columns={userColumns}
            rowKey="id"
            pagination={false}
            size="small"
            bordered
            loading={loading}
            style={{ fontSize: 13, background: '#fff', borderRadius: 8 }}
          />
          </div>

          {/* ---------- 新增用户弹窗 ---------- */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>新增用户</span>}
            open={addOpen}
            onCancel={() => setAddOpen(false)}
            width={480}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<CloseOutlined />} onClick={() => setAddOpen(false)}
                  style={{ borderRadius: 3, width: 36, height: 36 }} />
                <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={handleAddUser}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >

              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col width="100" /><col width="*" />
                </colgroup>
                <tbody>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>姓名 <span style={{ color: COLORS.danger }}>*</span></td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="输入用户姓名" style={INP_STYLE} />
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>手机号</td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                        placeholder="输入手机号" style={INP_STYLE} />
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>邮箱 *</td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                        placeholder="user@example.com" style={INP_STYLE} />
                      <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>作为登录账号</span>
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>职务 *</td>
                    <td style={VAL_CELL_STYLE}>
                      <select value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: 0, cursor: 'pointer', color: COLORS.textPrimary }}>
                        <option value="销售经理">销售经理</option>
                        <option value="方案经理">方案经理</option>
                        <option value="交付经理">交付经理</option>
                        <option value="部门总监">部门总监</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 12, textAlign: 'center' }}>
                💡 新增用户初始密码为 <strong>{DEFAULT_USER_PASSWORD}</strong>
              </div>
          </Modal>

          {/* ---------- 编辑用户弹窗 ---------- */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>编辑用户</span>}
            open={editOpen}
            onCancel={() => { setEditOpen(false); setEditTarget(null); }}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<CloseOutlined />} onClick={() => { setEditOpen(false); setEditTarget(null); }}
                  style={{ borderRadius: 3, width: 36, height: 36 }} />
                <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={handleEditSave}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col width="100" /><col width="*" />
                </colgroup>
                <tbody>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>姓名</td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={editName} onChange={e => setEditName(e.target.value)} style={INP_STYLE} />
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>手机号</td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={INP_STYLE} />
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>职务</td>
                    <td style={VAL_CELL_STYLE}>
                      <select value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: 0, cursor: 'pointer', color: COLORS.textPrimary }}>
                        <option value="销售经理">销售经理</option>
                        <option value="方案经理">方案经理</option>
                        <option value="交付经理">交付经理</option>
                        <option value="部门总监">部门总监</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>邮箱 *</td>
                    <td style={VAL_CELL_STYLE}>
                      <input value={editEmail} onChange={e => setEditEmail(e.target.value)} style={INP_STYLE} />
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Modal>

          {/* ---------- 密码重置弹窗 ---------- */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>重置密码</span>}
            open={pwdOpen}
            onCancel={() => { setPwdOpen(false); setEditTarget(null); }}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<CloseOutlined />} onClick={() => { setPwdOpen(false); setEditTarget(null); }}
                  style={{ borderRadius: 3, width: 36, height: 36 }} />
                <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={handlePwdReset}
                  style={{ borderColor: COLORS.warning, color: COLORS.warning, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <><div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                用户：<strong style={{ color: COLORS.textDark }}>{editTarget.displayName}</strong>
                <span style={{ color: COLORS.textLight, marginLeft: 8 }}>（{editTarget.email}）</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col width="100" /><col width="*" />
                </colgroup>
                <tbody>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>新密码 *</td>
                    <td style={VAL_CELL_STYLE}>
                      <input type="password" value={resetPwd}
                        onChange={e => setResetPwd(e.target.value)}
                        placeholder="输入新密码（至少6位）" style={INP_STYLE} />
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>确认密码 *</td>
                    <td style={VAL_CELL_STYLE}>
                      <input type="password" value={confirmPwd}
                        onChange={e => setConfirmPwd(e.target.value)}
                        placeholder="再次输入新密码" style={INP_STYLE} />
                    </td>
                  </tr>
                </tbody>
              </table>
              </>
              )}
          </Modal>

          {/* ---------- 角色权限配置弹窗 ---------- */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>角色权限配置</span>}
            open={permOpen}
            onCancel={() => { setPermOpen(false); setEditTarget(null); }}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<CloseOutlined />} onClick={() => { setPermOpen(false); setEditTarget(null); }}
                  style={{ borderRadius: 3, width: 36, height: 36 }} />
                <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={handlePermSave}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                  用户：<strong style={{ color: COLORS.textDark }}>{editTarget.displayName}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>职务：</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['销售经理', '方案经理', '交付经理', '部门总监'].map(t => (
                      <div key={t} onClick={() => {
                            setPermTitle(t);
                            // 切换职务时自动填充该职务的默认权限（用户可再手动微调）
                            const template = TITLE_PERMISSIONS[t] || [];
                            setCheckedPerms([...template]);
                          }}
                        style={{
                          padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                          border: `1.5px solid ${permTitle === t ? COLORS.primary : '#d0d0d0'}`,
                          color: permTitle === t ? '#fff' : '#555',
                          background: permTitle === t ? COLORS.primary : '#fff',
                          transition: 'all 0.15s', userSelect: 'none',
                        }}>{t}</div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>权限：</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ALL_PERMISSIONS.map(p => (
                      <div key={p}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 4,
                          background: checkedPerms.includes(p) ? '#f0f6ff' : COLORS.bgLight,
                          cursor: 'pointer', userSelect: 'none',
                        }}
                        onClick={() => {
                          setCheckedPerms(prev =>
                            prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                          );
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                          border: `2px solid ${checkedPerms.includes(p) ? COLORS.primary : '#d0d0d0'}`,
                          background: checkedPerms.includes(p) ? COLORS.primary : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s', userSelect: 'none',
                        }}>
                          {checkedPerms.includes(p) && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 13, color: COLORS.textPrimary }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Modal>

        </div>
      )}

      {/* ================================================================
          操作日志
          ================================================================ */}
      {tab === 'logs' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>模块筛选：</span>
            {logModules.map(m => (
              <div key={m} onClick={() => setLogModuleFilter(m === '全部' ? null : m)}
                style={{
                  padding: '3px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 12,
                  background: (m === '全部' && !logModuleFilter) || logModuleFilter === m ? COLORS.primary : COLORS.borderLight,
                  color: (m === '全部' && !logModuleFilter) || logModuleFilter === m ? '#fff' : COLORS.textPrimary,
                  transition: 'all 0.15s', userSelect: 'none',
                }}>
                {m}
              </div>
            ))}
          </div>

          <div style={{
            borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
          }}>
          <Table<AuditLog>
            dataSource={filteredLogs}
            columns={logColumns}
            pagination={false}
            size="small"
            style={{ fontSize: 13, background: '#fff', borderRadius: 8 }}
          />
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>删除用户</span>}
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        width={420}
        destroyOnHidden
        styles={{ body: { padding: '24px 28px 12px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<CloseOutlined />} onClick={() => setDeleteTarget(null)}
              style={{ borderRadius: 3, width: 36, height: 36 }} />
            <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={confirmDeleteUser}
              style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary }}>确定删除用户「{deleteTarget?.displayName}」吗？</div>
        </div>
      </Modal>

    </div>
  );
};

export default SystemManagement;
