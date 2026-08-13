import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Table, Button, Modal, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined, KeyOutlined, CheckOutlined, CloseOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { COLORS, LABEL_CELL_STYLE } from '../styles/colors';
import { formatBeijing } from '../utils/timeFormat';
import { LIST_LIMIT } from '../utils/constants';
import { userService, type UserRecord } from '../services/userService';
import { auditLogService, type AuditLog } from '../services/auditLogService';
import type { TableProps } from 'antd';
import { BARE_INPUT_STYLE } from '../utils/tableUtils';
import { tabItemStyle } from '../utils/tableUtils';

/** 生成随机初始密码（≥8 位，大小写字母+数字+特殊字符混合）
 *  ⚠️ B27：弃共享硬编码默认密码 ChangeMe@2024——任一管理员看到弹窗即知道全员初始密码，
 *  存在账号接管风险；改为每人随机、创建成功时仅此一次展示，由创建人安全渠道告知本人。 */
function generateRandomPassword(): string {
  const sets = ['ABCDEFGHJKMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!@#$%^&*'];
  const pool = sets.join('');
  const chars = sets.map(s => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length]);
  for (let i = chars.length; i < 12; i++) {
    chars.push(pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/* ============================================================
   共用样式
   ============================================================ */
const VAL_CELL_STYLE: React.CSSProperties = {
  padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`,
  verticalAlign: 'middle',
};

const INP_STYLE: React.CSSProperties = {
  width: '100%', ...BARE_INPUT_STYLE,
  fontSize: 13, padding: '2px 0', margin: 0, display: 'block',
  boxSizing: 'border-box', lineHeight: 1.3,
};

const BTN_BASE: React.CSSProperties = {
  borderRadius: 3, width: 36, height: 36,
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
  '仪表盘查看', '销售分析', '销售机会管理', '新建信息/线索/机会', '编辑销售机会', '转线索/转机会',
  '销售蓝表编辑', '报价列表查看', '报价编制', '审批管理', '交付管理', '交付分析',
  '成本录入', '物料管理', '新增物料', '新建标签', '客户管理', '新建客户',
  '用户管理', '系统配置', '全部查看权限',
];

const TITLE_PERMISSIONS: Record<string, string[]> = {
  // ⚠️ 普通员工：供工时填报/统计应用使用的员工角色（无业务系统编辑权限，仅可看仪表盘）
  '普通员工': ['仪表盘查看'],
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
  '普通员工': 'user',
};

/* ============================================================
   静态表格列定义（无状态依赖）
   ============================================================ */
const TITLE_OPTIONS = ['普通员工', '销售经理', '方案经理', '交付经理', '部门总监'];

const SystemManagement: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('users');
  const [messageApi, msgContextHolder] = message.useMessage();

  // 用户数据
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    userService.list()
      .then(data => { if (!cancelled) setUsers(data); })
      .catch((err: unknown) => messageApi.error('加载用户列表失败：' + ((err as Error).message || '未知错误')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [messageApi]);

  // 弹窗状态
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  // ⚠️ B27 复核：随机初始密码仅此一次展示——message toast 数秒自动消失，密码即永久丢失；
  //   改为持久 Modal + 一键复制（关闭后不再展示，创建人须当场抄送用户）
  const [tempCred, setTempCred] = useState<{ name: string; email: string; password: string } | null>(null);

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
  const [logLoading, setLogLoading] = useState(false);
  const [logModuleFilter, setLogModuleFilter] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      // ⚠️ 传 limit:'1000'，避免后端默认 limit=100 导致日志截断
      const data = await auditLogService.list({ limit: LIST_LIMIT });
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

  /** 通用：清除编辑目标并关闭弹窗 */
  const closeModal = (setter: (v: boolean) => void) => {
    setter(false);
    setEditTarget(null);
  };

  /* ---- 用户管理操作 ---- */

  const toggleUserActive = useCallback(async (user: UserRecord) => {
    try {
      const updated = await userService.update(user.id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (err: unknown) {
      messageApi.error('操作失败：' + ((err as Error).message || ''));
    }
  }, [messageApi]);

  const handleAddUser = async () => {
    if (!newName.trim()) { messageApi.warning('请输入用户姓名'); return; }
    if (!newEmail.trim()) { messageApi.warning('请输入邮箱'); return; }

    setSaving(true);
    try {
      // ⚠️ B27：每人随机初始密码，创建成功后一次性展示（下方成功消息），不落库明文
      const password = generateRandomPassword();
      const created = await userService.create({
        email: newEmail.trim(),
        displayName: newName.trim(),
        title: newTitle,
        phone: newPhone.trim(),
        password,
        role: TITLE_ROLE_MAP[newTitle] || 'user',
      });
      // 为新用户初始化默认权限（基于选择的职务）
      const defaultPerms = TITLE_PERMISSIONS[newTitle] || [];
      // ⚠️ updateRole 失败须回滚并提示（原静默吞掉会创建"无权限死账号"：前端显示有权限而 DB 未持久化）
      try {
        await userService.updateRole(created.id, TITLE_ROLE_MAP[newTitle] || 'user', newTitle, defaultPerms);
      } catch {
        await userService.delete(created.id).catch(() => {});
        messageApi.error('用户已创建但权限初始化失败，已回滚删除，请重试');
        return;
      }
      setUsers(prev => [...prev, { ...created, permissions: defaultPerms }]);
      setAddOpen(false);
      messageApi.success(`用户 ${created.displayName} 添加成功`);
      // ⚠️ B27 复核：初始密码改由持久 Modal 展示（toast 自动消失会丢密码），见下方「初始密码」弹窗
      setTempCred({ name: created.displayName, email: created.email, password });
    } catch (err: unknown) {
      messageApi.error((err as Error).message || '添加失败');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = useCallback((u: UserRecord) => {
    setEditTarget(u);
    setEditName(u.displayName);
    setEditTitle(u.title);
    setEditPhone(u.phone || '');
    setEditEmail(u.email);
    setEditOpen(true);
  }, []);

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
      // ⚠️ B2 修复：职务变更须同步 role/permissions（否则界面显示"部门总监"但实际无总监权限，成本覆盖解锁/后端校验均失效）
      if (editTitle !== editTarget.title) {
        await userService.updateRole(editTarget.id, TITLE_ROLE_MAP[editTitle] || 'user', editTitle, TITLE_PERMISSIONS[editTitle] || []);
      }
      const newPerms = editTitle !== editTarget.title ? (TITLE_PERMISSIONS[editTitle] || []) : updated.permissions;
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...updated, permissions: newPerms } : u));
      closeModal(setEditOpen);
      messageApi.success('用户信息已更新');
    } catch (err: unknown) {
      messageApi.error((err as Error).message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const openPwdModal = useCallback((u: UserRecord) => {
    setEditTarget(u);
    setResetPwd(''); setConfirmPwd('');
    setPwdOpen(true);
  }, []);

  const handlePwdReset = async () => {
    if (!editTarget) return;
    if (!resetPwd.trim()) { messageApi.warning('请输入新密码'); return; }
    if (resetPwd.length < 8) { messageApi.warning('密码长度不能少于8位'); return; }
    if (resetPwd !== confirmPwd) { messageApi.warning('两次输入的密码不一致'); return; }

    setSaving(true);
    try {
      await userService.resetPassword(editTarget.id, resetPwd);
      closeModal(setPwdOpen);
      messageApi.success('密码已重置');
    } catch (err: unknown) {
      messageApi.error((err as Error).message || '密码重置失败');
    } finally {
      setSaving(false);
    }
  };

  const openPermModal = useCallback((u: UserRecord) => {
    setEditTarget(u);
    setPermTitle(u.title);
    // 优先使用数据库已保存的权限，否则用职务预设
    setCheckedPerms(u.permissions && u.permissions.length > 0
      ? [...u.permissions]
      : [...(TITLE_PERMISSIONS[u.title] || [])]);
    setPermOpen(true);
  }, []);

  const handlePermSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const updated = await userService.updateRole(editTarget.id, TITLE_ROLE_MAP[permTitle] || 'user', permTitle, checkedPerms);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      closeModal(setPermOpen);
      messageApi.success('角色权限已更新');
    } catch (err: unknown) {
      messageApi.error((err as Error).message || '更新失败');
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
      messageApi.error((err as Error).message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  /* ---- 表格列 ---- */
  const userColumns: TableProps<UserRecord>['columns'] = useMemo(() => [
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
  ], [toggleUserActive, openEditModal, openPwdModal, openPermModal]);

  /* ---- 操作日志 ---- */
  const logModules = useMemo(() => {
    const mods = new Set(logs.map(l => l.module));
    return ['全部', ...Array.from(mods)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    // 点击「全部」时存 null（见下方模块筛选 onClick），logModuleFilter 不会等于 '全部'
    if (!logModuleFilter) return logs;
    return logs.filter(l => l.module === logModuleFilter);
  }, [logs, logModuleFilter]);

  const logColumns: TableProps<AuditLog>['columns'] = useMemo(() => [
    { title: '时间', dataIndex: 'time', key: 'time', width: 160,
      render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textDark }}>{formatBeijing(v)}</span>,
    },
    { title: '操作人', dataIndex: 'userName', key: 'userName', width: 100,
      render: (_: string, rec: AuditLog) => (
        <span style={{ color: COLORS.textDark, fontSize: 13 }}>{rec.displayName || rec.userName || '—'}</span>
      ),
    },
    { title: '模块', dataIndex: 'module', key: 'module', width: 88 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 88 },
    { title: '详情', dataIndex: 'detail', key: 'detail',
      render: (v: string) => <span style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{v}</span>,
    },
  ], []);

  /** 弹窗通用确认/取消按钮组 */
  const modalFooter = (onConfirm: () => void, onClose: () => void, confirmColor?: string) => ({
    footer: (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button icon={<CloseOutlined />} onClick={onClose} style={BTN_BASE} />
        <Button type="primary" ghost icon={<CheckOutlined />} loading={saving} onClick={onConfirm}
          style={{ ...BTN_BASE, borderColor: confirmColor || COLORS.primary, color: confirmColor || COLORS.primary }} />
      </div>
    ),
  });

  return (
    <div>
      {msgContextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.textDark }}>系统管理</span>
      </div>

      {/* ── Tab 切换 ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `2px solid ${COLORS.border}` }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={tabItemStyle(tab === t.key, COLORS.primary)}>{t.label}</div>
        ))}
      </div>

      {/* ================================================================
          用户管理
          ================================================================ */}
      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button type="default" ghost icon={<PlusOutlined />} onClick={() => { setNewName(''); setNewTitle('销售经理'); setNewPhone(''); setNewEmail(''); setAddOpen(true); }}
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
            scroll={{ x: 830 }}
            style={{ fontSize: 13, background: '#fff', borderRadius: 8 }}
          />
          </div>

          {/* ── 新增用户弹窗 ── */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>新增用户</span>}
            open={addOpen}
            onCancel={() => setAddOpen(false)}
            width={480}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            {...modalFooter(handleAddUser, () => setAddOpen(false))}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup><col width="100" /><col width="*" /></colgroup>
              <tbody>
                <tr>
                  <td style={LABEL_CELL_STYLE}>姓名 <span style={{ color: COLORS.danger }}>*</span></td>
                  <td style={VAL_CELL_STYLE}>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入用户姓名" style={INP_STYLE} />
                  </td>
                </tr>
                <tr>
                  <td style={LABEL_CELL_STYLE}>手机号</td>
                  <td style={VAL_CELL_STYLE}>
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="输入手机号" style={INP_STYLE} />
                  </td>
                </tr>
                <tr>
                  <td style={LABEL_CELL_STYLE}>邮箱 *</td>
                  <td style={VAL_CELL_STYLE}>
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" style={INP_STYLE} />
                    <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>作为登录账号</span>
                  </td>
                </tr>
                <tr>
                  <td style={LABEL_CELL_STYLE}>职务 *</td>
                  <td style={VAL_CELL_STYLE}>
                    <select value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      style={{ width: '100%', ...BARE_INPUT_STYLE, fontSize: 13, padding: 0, cursor: 'pointer', color: COLORS.textPrimary }}>
                      {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 12, textAlign: 'center' }}>
              💡 新增用户将生成随机初始密码，创建成功后仅此一次展示，请通过安全渠道告知用户
            </div>
          </Modal>

          {/* ── 编辑用户弹窗 ── */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>编辑用户</span>}
            open={editOpen}
            onCancel={() => closeModal(setEditOpen)}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            {...modalFooter(handleEditSave, () => closeModal(setEditOpen))}
          >
            {editTarget && (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup><col width="100" /><col width="*" /></colgroup>
                <tbody>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>姓名</td>
                    <td style={VAL_CELL_STYLE}><input value={editName} onChange={e => setEditName(e.target.value)} style={INP_STYLE} /></td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>手机号</td>
                    <td style={VAL_CELL_STYLE}><input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={INP_STYLE} /></td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>职务</td>
                    <td style={VAL_CELL_STYLE}>
                      <select value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        style={{ width: '100%', ...BARE_INPUT_STYLE, fontSize: 13, padding: 0, cursor: 'pointer', color: COLORS.textPrimary }}>
                        {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td style={LABEL_CELL_STYLE}>邮箱 *</td>
                    <td style={VAL_CELL_STYLE}><input value={editEmail} onChange={e => setEditEmail(e.target.value)} style={INP_STYLE} /></td>
                  </tr>
                </tbody>
              </table>
            )}
          </Modal>

          {/* ── 密码重置弹窗 ── */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>重置密码</span>}
            open={pwdOpen}
            onCancel={() => closeModal(setPwdOpen)}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            {...modalFooter(handlePwdReset, () => closeModal(setPwdOpen), COLORS.warning)}
          >
            {editTarget && (
              <>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                  用户：<strong style={{ color: COLORS.textDark }}>{editTarget.displayName}</strong>
                  <span style={{ color: COLORS.textLight, marginLeft: 8 }}>（{editTarget.email}）</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup><col width="100" /><col width="*" /></colgroup>
                  <tbody>
                    <tr>
                      <td style={LABEL_CELL_STYLE}>新密码 *</td>
                      <td style={VAL_CELL_STYLE}>
                        <input type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)}
                          placeholder="输入新密码（至少8位）" style={INP_STYLE} />
                      </td>
                    </tr>
                    <tr>
                      <td style={LABEL_CELL_STYLE}>确认密码 *</td>
                      <td style={VAL_CELL_STYLE}>
                        <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                          placeholder="再次输入新密码" style={INP_STYLE} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </Modal>

          {/* ── 角色权限配置弹窗 ── */}
          <Modal
            title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>角色权限配置</span>}
            open={permOpen}
            onCancel={() => closeModal(setPermOpen)}
            width={460}
            destroyOnHidden
            styles={{ body: { padding: '14px 2px 6px' } }}
            {...modalFooter(handlePermSave, () => closeModal(setPermOpen))}
          >
            {editTarget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 0' }}>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 }}>
                  用户：<strong style={{ color: COLORS.textDark }}>{editTarget.displayName}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>职务：</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {TITLE_OPTIONS.map(t => (
                      <div key={t} onClick={() => { setPermTitle(t); setCheckedPerms([...(TITLE_PERMISSIONS[t] || [])]); }}
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
                        onClick={() => setCheckedPerms(prev =>
                          prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                        )}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                          border: `2px solid ${checkedPerms.includes(p) ? COLORS.primary : '#d0d0d0'}`,
                          background: checkedPerms.includes(p) ? COLORS.primary : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
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
            loading={logLoading}
            pagination={false}
            size="small"
            scroll={{ x: 436 }}
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
        {...modalFooter(confirmDeleteUser, () => setDeleteTarget(null), COLORS.danger)}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary }}>确定删除用户「{deleteTarget?.displayName}」吗？</div>
        </div>
      </Modal>

      {/* ⚠️ B27 复核：初始密码仅此一次展示——持久 Modal（非自动消失的 toast）+ 一键复制，
          关闭后不再展示，创建人须当场抄送用户；阻止右上角 X 关闭防误关丢密码 */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark }}>用户创建成功 · 初始密码</span>}
        open={!!tempCred}
        closable={false}
        maskClosable={false}
        width={440}
        destroyOnHidden
        footer={[
          <Button
            key="copy"
            type="primary"
            icon={<KeyOutlined />}
            onClick={() => {
              if (tempCred) {
                navigator.clipboard?.writeText(tempCred.password)
                  .then(() => messageApi.success('初始密码已复制，请通过安全渠道告知用户'))
                  .catch(() => messageApi.warning('复制失败，请手动抄记密码'));
              }
            }}
          >复制密码</Button>,
          <Button key="done" onClick={() => { setTempCred(null); messageApi.success('已确认，初始密码不再展示'); }}>我已告知用户</Button>,
        ]}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
            以下初始密码<strong style={{ color: COLORS.danger }}>仅此一次展示</strong>，关闭后无法再次查看。请立即通过安全渠道告知用户，并提醒其登录后尽快修改密码。
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
            账号：<span style={{ color: COLORS.textDark, fontWeight: 600 }}>{tempCred?.email}</span>
          </div>
          <div style={{
            background: '#f5f5f5', borderRadius: 6, padding: '12px 14px', fontSize: 16,
            fontWeight: 700, color: COLORS.primary, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 1,
          }}>
            {tempCred?.password}
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default SystemManagement;
