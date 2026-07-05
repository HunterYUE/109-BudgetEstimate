import React, { useState, useMemo } from 'react';
import { Table, Button, Modal, Input, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined, KeyOutlined, CheckOutlined, CloseOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { COLORS } from '../styles/constants';
import type { TableProps } from 'antd';

/* ============================================================
   Mock 数据：用户列表
   ============================================================ */
interface MockUser {
  key: string;
  name: string;
  role: string;
  phone: string;
  email: string;       // 同时也是登录用户名
  password: string;
  active: boolean;
}

const MOCK_USERS: MockUser[] = [
  { key: 'u1', name: '张明', role: '销售经理', phone: '13800001001', email: 'zhangming@example.com', password: '123456', active: true },
  { key: 'u2', name: '王芳', role: '销售经理', phone: '13800001002', email: 'wangfang@example.com', password: '123456', active: true },
  { key: 'u3', name: '李华', role: '销售经理', phone: '13800001003', email: 'lihua@example.com', password: '123456', active: true },
  { key: 'u4', name: '陈伟', role: '销售经理', phone: '13800001004', email: 'chenwei@example.com', password: '123456', active: true },
  { key: 'u5', name: '赵工', role: '方案经理', phone: '13800002001', email: 'zhaogong@example.com', password: '123456', active: true },
  { key: 'u6', name: '钱工', role: '方案经理', phone: '13800002002', email: 'qiangong@example.com', password: '123456', active: false },
  { key: 'u7', name: '孙经理', role: '交付经理', phone: '13800003001', email: 'sunjingli@example.com', password: '123456', active: true },
  { key: 'u8', name: '周经理', role: '交付经理', phone: '13800003002', email: 'zhoujingli@example.com', password: '123456', active: true },
  { key: 'u9', name: '刘总监', role: '总监', phone: '13800009001', email: 'liu@example.com', password: '123456', active: true },
];

const ROLE_COLORS: Record<string, string> = {
  '销售经理': COLORS.primary,
  '方案经理': COLORS.success,
  '交付经理': COLORS.warning,
  '总监': COLORS.purple,
};

/* ============================================================
   Mock 数据：操作日志
   ============================================================ */
interface MockLog {
  key: string;
  time: string;
  user: string;
  action: string;
  module: string;
  detail: string;
}

const MOCK_LOGS: MockLog[] = [
  { key: 'l1', time: '2026-07-03 10:23:15', user: '赵工', action: '提交审核', module: '报价编制', detail: '项目"双料垛料库 MS3015-13*16-2" V2.3 提交总监审核' },
  { key: 'l2', time: '2026-07-03 09:45:00', user: '张明', action: '更新状态', module: '销售机会', detail: '项目"智能仓储系统升级" 状态变更为 议价' },
  { key: 'l3', time: '2026-07-02 17:30:22', user: '刘总监', action: '审核通过', module: '报价审批', detail: '项目"双料垛料库" V2.2 审核通过' },
  { key: 'l4', time: '2026-07-02 16:12:08', user: '孙经理', action: '更新节点', module: '交付管理', detail: '项目"挖掘机智能产线" 节点#8 制造采购 → 已完成' },
  { key: 'l5', time: '2026-07-02 14:55:44', user: '赵工', action: '新建物料', module: '物料管理', detail: '新增组件"H-LABOR-DESIGN-V1.0" 设计工费' },
  { key: 'l6', time: '2026-07-02 11:20:30', user: '王芳', action: '生成报价表', module: '报价管理', detail: '项目"摄像头组装测试线" V1.0 报价表已生成' },
  { key: 'l7', time: '2026-07-01 15:08:12', user: '周经理', action: '提交成本', module: '交付管理', detail: '项目"双料垛料库" 成本对比提交审批' },
  { key: 'l8', time: '2026-07-01 10:35:00', user: '陈伟', action: '更新客户', module: '客户管理', detail: '客户"万华化学" 信用等级 A→B' },
  { key: 'l9', time: '2026-06-30 16:45:20', user: '刘总监', action: '审核驳回', module: '报价审批', detail: '项目"电池pack自动化产线" V1.0 GP3 仅12.8%，驳回' },
  { key: 'l10', time: '2026-06-30 14:20:55', user: '钱工', action: '登录', module: '系统', detail: '用户登录系统' },
  { key: 'l11', time: '2026-06-30 11:10:33', user: '张明', action: '更新赢率', module: '销售机会', detail: '项目"高空作业平台装配线" 赢率 15%→20%' },
  { key: 'l12', time: '2026-06-29 09:30:00', user: '孙经理', action: '提交计划', module: '交付管理', detail: '项目"挖掘机智能产线" 实施计划提交审批' },
];

type TabKey = 'users' | 'logs';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'logs', label: '操作日志' },
];

/* ============================================================
   角色权限模板（静态定义、可切换）
   ============================================================ */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  '销售经理': ['销售机会管理', '报价列表查看', '销售分析', '客户管理'],
  '方案经理': ['物料管理', '报价编制', '标签管理', '物料审核提交'],
  '交付经理': ['交付管理', '交付分析', '成本录入'],
  '总监': ['审批管理', '用户管理', '系统配置', '全部查看权限'],
};

/* ============================================================
   Component
   ============================================================ */
const SystemManagement: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('users');
  const [messageApi, msgContextHolder] = message.useMessage();

  // 用户管理状态
  const [users, setUsers] = useState<MockUser[]>(MOCK_USERS);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MockUser | null>(null);

  // 新增用户表单
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('销售经理');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // 编辑用户表单
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // 密码重置
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // 角色权限
  const [permRole, setPermRole] = useState('销售经理');
  const [checkedPerms, setCheckedPerms] = useState<string[]>([]);

  // 操作日志筛选
  const [logModuleFilter, setLogModuleFilter] = useState<string | null>(null);

  /* ---- 用户管理 ---- */

  const toggleUserActive = (key: string) => {
    setUsers(prev => prev.map(u => u.key === key ? { ...u, active: !u.active } : u));
  };

  const openAddModal = () => {
    setNewName(''); setNewRole('销售经理'); setNewPhone(''); setNewEmail('');
    setAddOpen(true);
  };

  const handleAddUser = () => {
    if (!newName.trim()) { messageApi.warning('请输入用户姓名'); return; }
    if (!newEmail.trim()) { messageApi.warning('请输入邮箱（登录用户名）'); return; }
    if (users.some(u => u.email === newEmail.trim())) { messageApi.warning('该邮箱已被使用'); return; }
    const key = 'u' + Date.now();
    setUsers(prev => [...prev, {
      key, name: newName.trim(), role: newRole,
      phone: newPhone.trim(), email: newEmail.trim(), password: '123456', active: true,
    }]);
    setAddOpen(false);
    messageApi.success(`用户 ${newName.trim()} 添加成功（初始密码 123456）`);
  };

  const openEditModal = (u: MockUser) => {
    setEditTarget(u);
    setEditPhone(u.phone);
    setEditEmail(u.email);
    setEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editTarget) return;
    if (!editEmail.trim()) { messageApi.warning('邮箱不能为空'); return; }
    if (users.some(u => u.key !== editTarget.key && u.email === editEmail.trim())) {
      messageApi.warning('该邮箱已被其他用户使用');
      return;
    }
    setUsers(prev => prev.map(u => u.key === editTarget!.key ? { ...u, phone: editPhone.trim(), email: editEmail.trim() } : u));
    setEditOpen(false);
    setEditTarget(null);
    messageApi.success('用户信息已更新');
  };

  const openPwdModal = (u: MockUser) => {
    setEditTarget(u);
    setNewPwd(''); setConfirmPwd('');
    setPwdOpen(true);
  };

  const handlePwdReset = () => {
    if (!editTarget) return;
    if (!newPwd.trim()) { messageApi.warning('请输入新密码'); return; }
    if (newPwd.length < 6) { messageApi.warning('密码长度不能少于6位'); return; }
    if (newPwd !== confirmPwd) { messageApi.warning('两次输入的密码不一致'); return; }
    setUsers(prev => prev.map(u => u.key === editTarget!.key ? { ...u, password: newPwd } : u));
    setPwdOpen(false);
    setEditTarget(null);
    messageApi.success('密码已重置');
  };

  const openPermModal = (u: MockUser) => {
    setEditTarget(u);
    setPermRole(u.role);
    setCheckedPerms([...(ROLE_PERMISSIONS[u.role] || [])]);
    setPermOpen(true);
  };

  const handlePermSave = () => {
    if (!editTarget) return;
    messageApi.success(`${editTarget.name} 的角色权限已更新`);
    setPermOpen(false);
    setEditTarget(null);
  };

  /* ---- 表格列 ---- */
  const userColumns: TableProps<MockUser>['columns'] = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 100,
      render: (r: string) => (
        <span style={{ color: ROLE_COLORS[r] || COLORS.textSecondary, fontWeight: 600 }}>{r}</span>
      ),
    },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 140 },
    {
      title: '邮箱（登录名）', dataIndex: 'email', key: 'email', width: 200,
      render: (v: string) => <span style={{ color: COLORS.textDark }}>{v}</span>,
    },
    {
      title: '状态', dataIndex: 'active', key: 'active', width: 70,
      render: (v: boolean, rec: MockUser) => (
        <Switch checked={v} size="small" onChange={() => toggleUserActive(rec.key)}
          style={{ background: v ? COLORS.success : COLORS.borderInput }} />
      ),
    },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: unknown, rec: MockUser) => (
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
          <span onClick={() => {
            setUsers(prev => prev.filter(u => u.key !== rec.key));
            messageApi.success('用户已移除（演示数据，刷新后恢复）');
          }}
            style={{ color: COLORS.danger, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            <DeleteOutlined style={{ marginRight: 2 }} />移除
          </span>
        </div>
      ),
    },
  ];

  /* ---- 操作日志 ---- */
  const logModules = useMemo(() => {
    const mods = new Set(MOCK_LOGS.map(l => l.module));
    return ['全部', ...Array.from(mods)];
  }, []);

  const filteredLogs = useMemo(() => {
    if (!logModuleFilter || logModuleFilter === '全部') return MOCK_LOGS;
    return MOCK_LOGS.filter(l => l.module === logModuleFilter);
  }, [logModuleFilter]);

  const logColumns: TableProps<MockLog>['columns'] = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 160 },
    { title: '操作人', dataIndex: 'user', key: 'user', width: 72 },
    { title: '模块', dataIndex: 'module', key: 'module', width: 88 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 88 },
    { title: '详情', dataIndex: 'detail', key: 'detail' },
  ];

  return (
    <div>
      {msgContextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>系统管理</span>
      </div>

      {/* Tab 导航 */}
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
          {/* 新增按钮 — 与销售管理页面新增信息/线索/机会按钮一致 */}
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
          <Table<MockUser>
            dataSource={users}
            columns={userColumns}
            pagination={false}
            size="small"
            bordered
            style={{ fontSize: 13, background: '#fff', borderRadius: 8 }}
          />
          </div>

          {/* ---------- 新增用户弹窗（参考审批管理弹窗样式） ---------- */}
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
                <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleAddUser}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>姓名 <span style={{ color: COLORS.danger }}>*</span></div>
                  <Input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="输入用户姓名" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>手机号</div>
                  <Input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="输入手机号" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                  邮箱（登录用户名） <span style={{ color: COLORS.danger }}>*</span>
                  <span style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 6 }}>此邮箱即为系统登录账号</span>
                </div>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com" style={{ borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>角色 <span style={{ color: COLORS.danger }}>*</span></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['销售经理', '方案经理', '交付经理', '总监'].map(r => (
                    <div key={r} onClick={() => setNewRole(r)}
                      style={{
                        padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                        border: `1.5px solid ${newRole === r ? ROLE_COLORS[r] || COLORS.primary : '#d0d0d0'}`,
                        color: newRole === r ? '#fff' : '#555',
                        background: newRole === r ? (ROLE_COLORS[r] || COLORS.primary) : '#fff',
                        transition: 'all 0.15s', userSelect: 'none',
                      }}>{r}</div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>
                💡 新增用户初始密码为 <strong>123456</strong>，可在「密码」功能中重置
              </div>
            </div>
          </Modal>

          {/* ---------- 编辑用户弹窗（电话/邮箱） ---------- */}
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
                <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleEditSave}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.textDark }}>{editTarget.name}</span>
                  <span style={{ fontSize: 13, color: ROLE_COLORS[editTarget.role] || COLORS.textSecondary, fontWeight: 600 }}>({editTarget.role})</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>手机号</div>
                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    placeholder="输入手机号" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                    邮箱（登录用户名） <span style={{ color: COLORS.danger }}>*</span>
                  </div>
                  <Input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    placeholder="user@example.com" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
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
                <Button type="primary" ghost icon={<CheckOutlined />} onClick={handlePwdReset}
                  style={{ borderColor: COLORS.warning, color: COLORS.warning, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                  用户：<strong style={{ color: COLORS.textDark }}>{editTarget.name}</strong>
                  <span style={{ color: COLORS.textLight, marginLeft: 8 }}>（{editTarget.email}）</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>新密码 <span style={{ color: COLORS.danger }}>*</span></div>
                  <Input.Password value={newPwd} onChange={e => setNewPwd(e.target.value)}
                    placeholder="输入新密码（至少6位）" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>确认密码 <span style={{ color: COLORS.danger }}>*</span></div>
                  <Input.Password value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                    placeholder="再次输入新密码" style={{ borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
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
                <Button type="primary" ghost icon={<CheckOutlined />} onClick={handlePermSave}
                  style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
              </div>
            }
          >
            {editTarget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                  用户：<strong style={{ color: COLORS.textDark }}>{editTarget.name}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>角色：</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['销售经理', '方案经理', '交付经理', '总监'].map(r => (
                      <div key={r} onClick={() => {
                        setPermRole(r);
                        setCheckedPerms([...(ROLE_PERMISSIONS[r] || [])]);
                      }}
                        style={{
                          padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                          border: `1.5px solid ${permRole === r ? ROLE_COLORS[r] || COLORS.primary : '#d0d0d0'}`,
                          color: permRole === r ? '#fff' : '#555',
                          background: permRole === r ? (ROLE_COLORS[r] || COLORS.primary) : '#fff',
                          transition: 'all 0.15s', userSelect: 'none',
                        }}>{r}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>权限：</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(ROLE_PERMISSIONS[permRole] || []).map(p => (
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
                <div style={{ fontSize: 12, color: COLORS.textLight }}>
                  💡 Demo 阶段权限为静态展示，角色切换后自动加载该角色的默认权限
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
          <Table<MockLog>
            dataSource={filteredLogs}
            columns={logColumns}
            pagination={false}
            size="small"
            style={{ fontSize: 13, background: '#fff', borderRadius: 8 }}
          />
          </div>

        </div>
      )}

      {/* 全局表格行样式 */}

    </div>
  );
};

export default SystemManagement;
