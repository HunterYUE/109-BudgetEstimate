import React, { useState } from 'react';
import { Button, Modal, Table, Empty, Popover } from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined,
  PhoneOutlined, MailOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { Client, Contact, CreditLevel, ClientGrade } from '../../types';
import { COLORS } from '../../styles/colors';
import { INDUSTRIES, REGIONS } from './clientConstants';
import { LABEL_CELL_STYLE } from '../../styles/colors';

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
      styles={{ content: { padding: 0 } }}
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
              <div style={{ padding: '10px', fontSize: 12, color: COLORS.textLight, textAlign: 'center' }}>无匹配</div>
            ) : filtered.map(i => (
              <div key={i}
                onClick={() => { onChange(i); setOpen(false); setSearch(''); }}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  background: i === value ? '#f0f6ff' : '#fff', color: i === value ? COLORS.primary : COLORS.textPrimary,
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

// ── Props ──

interface ClientEditModalProps {
  open: boolean;
  editingId: string | null;
  editForm: Partial<Client>;
  editContacts: Contact[];
  editCity: string;
  clients: Client[];
  onClose: () => void;
  onFormChange: (patch: Partial<Client>) => void;
  onCityChange: (city: string) => void;
  onAddContact: () => void;
  onUpdateContact: (id: string, field: keyof Contact, value: string | number | boolean) => void;
  onRemoveContact: (id: string) => void;
  onSave: () => void;
  onAddSubsidiary: (parentId: string) => void;
  onEditClient: (client: Client) => void;
  onDeleteSubsidiary: (id: string) => void;
}

export interface SubsidiaryForm {
  name: string;
  code: string;
  industry: string;
  region: string;
  salesman: string;
  creditLevel: CreditLevel;
  grade: ClientGrade;
}

interface ClientSubModalProps {
  open: boolean;
  subParentId: string;
  subForm: SubsidiaryForm;
  clients: Client[];
  onClose: () => void;
  onFormChange: (patch: Partial<SubsidiaryForm>) => void;
  onSave: () => void;
}

// ── 编辑客户 Modal ──

export const ClientEditModal: React.FC<ClientEditModalProps> = ({
  open, editingId, editForm, editContacts, editCity, clients,
  onClose, onFormChange, onCityChange,
  onAddContact, onUpdateContact, onRemoveContact, onSave,
  onAddSubsidiary, onEditClient, onDeleteSubsidiary,
}) => {
  // 当前编辑客户的子公司列表（一次性计算，避免在 JSX 中重复 filter）
  const subs = clients.filter(c => c.parentId === editingId);
  return (
    <Modal
      title={
        <span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>
          {editingId ? '编辑客户' : '新增客户'}
        </span>
      }
      open={open}
      onCancel={onClose}
      width={860}
      destroyOnHidden
      styles={{ body: { padding: '24px 28px 8px' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button icon={<CloseOutlined />} onClick={onClose}
            style={{ borderRadius: 3, width: 36, height: 36 }} />
          <Button type="primary" ghost icon={<CheckOutlined />} onClick={onSave}
            style={{ borderColor: COLORS.primary, color: COLORS.primary, borderRadius: 3, width: 36, height: 36 }} />
        </div>
      }
    >
      {/* ── 基本信息卡片 ── */}
      <div style={{
        background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
        padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>基本信息</span>
          {editForm.type === 'subsidiary' && editingId && (
            <span style={{ fontSize: 12, color: COLORS.textFormLabel, marginLeft: 'auto' }}>
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
              <td style={LABEL_CELL_STYLE}>客户名称</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.name || ''}
                  onChange={e => onFormChange({ name: e.target.value })}
                  disabled={editForm.type === 'subsidiary' && !!editingId}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
              <td style={LABEL_CELL_STYLE}>客户编号</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: COLORS.primary }}>
                  {editForm.code || '—'}
                </span>
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>行业</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <IndustryDropdown value={editForm.industry} onChange={val => onFormChange({ industry: val })} />
              </td>
              <td style={LABEL_CELL_STYLE}>区域</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                  onClick={() => {
                    const cur = REGIONS.indexOf(editForm.region || '');
                    onFormChange({ region: REGIONS[(cur + 1) % REGIONS.length] });
                  }}>
                  {editForm.region || '点击选择'} ▾
                </span>
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>区域销售</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.salesman || ''}
                  onChange={e => onFormChange({ salesman: e.target.value })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
              <td style={LABEL_CELL_STYLE}>城市代码</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editCity}
                  onChange={e => onCityChange(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="2~4位大写字母，如 SH"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box', fontFamily: 'monospace', fontWeight: 600 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>信用等级</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                  onClick={() => {
                    const levels: CreditLevel[] = ['A', 'B', 'C'];
                    const cur = levels.indexOf(editForm.creditLevel as CreditLevel);
                    onFormChange({ creditLevel: levels[(cur + 1) % levels.length] });
                  }}>
                  {editForm.creditLevel || '点击选择'} ▾
                </span>
              </td>
              <td style={LABEL_CELL_STYLE}>客户分级</td>
              <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                  onClick={() => {
                    const grades: ClientGrade[] = ['A', 'B', 'C'];
                    const cur = grades.indexOf(editForm.grade as ClientGrade);
                    onFormChange({ grade: grades[(cur + 1) % grades.length] });
                  }}>
                  {editForm.grade || '点击选择'} ▾
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 联系人卡片 ── */}
      <div style={{
        background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
        padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>联系人</span>
          <span style={{ fontSize: 12, color: COLORS.textFormLabel }}>（{editContacts.length}）</span>
        </div>

        <Table
          dataSource={editContacts}
          rowKey="id"
          pagination={false}
          size="small"
          bordered
          scroll={{ x: 705 }}
          locale={{ emptyText: <Empty description="暂无联系人" /> }}
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
                    {c.name ? c.name.charAt(0) : (c.position || '?').charAt(0)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <input value={c.name}
                      onChange={e => onUpdateContact(c.id, 'name', e.target.value)}
                      placeholder="姓名"
                      style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600, color: COLORS.textDark, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                    <input value={c.position}
                      onChange={e => onUpdateContact(c.id, 'position', e.target.value)}
                      placeholder="职位"
                      style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 11, color: COLORS.textFormLabel, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
                  </div>
                </div>
              ),
            },
            {
              title: '汇报人', dataIndex: 'superior', width: 90,
              onCell: () => ({ style: { width: 90, minWidth: 90, maxWidth: 90 } }),
              render: (v: string, c: Contact) => (
                <input value={v || ''}
                  onChange={e => onUpdateContact(c.id, 'superior', e.target.value)}
                  placeholder="—"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: COLORS.textFormLabel, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              ),
            },
            {
              title: '电话', dataIndex: 'phone', width: 131,
              onCell: () => ({ style: { width: 131, minWidth: 131, maxWidth: 131 } }),
              render: (v: string, c: Contact) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <PhoneOutlined style={{ fontSize: 11, color: '#b0b8c4', flexShrink: 0 }} />
                  <input value={v || ''}
                    onChange={e => onUpdateContact(c.id, 'phone', e.target.value)}
                    placeholder="电话"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: COLORS.textPrimary, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
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
                    onChange={e => onUpdateContact(c.id, 'email', e.target.value)}
                    placeholder="邮箱"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: COLORS.textPrimary, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
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
                    onUpdateContact(c.id, 'decisionRole', roles[(cur + 1) % roles.length]);
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
                  onClick={() => onRemoveContact(c.id)} />
              ),
            },
          ]}
        />

        <Button type="dashed" icon={<PlusOutlined />} onClick={onAddContact}
          style={{ width: '100%', color: COLORS.primary, borderColor: COLORS.primary, borderRadius: 3, height: 32, fontSize: 13, marginTop: 14 }}>
          新增联系人
        </Button>
      </div>

      {/* ── 子公司卡片（仅企业类型） ── */}
      {editForm.type === 'enterprise' && (
        <div style={{
          background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
          padding: '20px 24px', marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>子公司</span>
            <span style={{ fontSize: 12, color: COLORS.textFormLabel }}>（{subs.length}）</span>
          </div>

          {subs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {subs.map(sub => (
                  <div key={sub.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#fff', border: `1px solid ${COLORS.borderInner}`, borderRadius: 1,
                    padding: '8px 12px', fontSize: 13,
                  }}>
                    <span style={{ fontSize: 11, color: '#b0b8c4' }}>└─</span>
                    <span style={{ fontWeight: 500, color: COLORS.textDark }}>{editForm.name}（{sub.name}）</span>
                    <span style={{ color: COLORS.textFormLabel, fontSize: 12 }}>{sub.code}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                      <Button type="text" size="small" icon={<EditOutlined />}
                        onClick={() => { onEditClient(sub); }}
                        style={{ color: COLORS.primary, fontSize: 12 }} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />}
                        onClick={() => onDeleteSubsidiary(sub.id)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#b0b8c4', marginBottom: 14, textAlign: 'center', padding: 6 }}>
                暂无子公司
              </div>
            )}

          <Button type="dashed" icon={<PlusOutlined />}
            onClick={() => editingId && onAddSubsidiary(editingId)}
            style={{ width: '100%', color: COLORS.primary, borderColor: COLORS.primary, borderRadius: 1, height: 36, fontSize: 13 }}>
            新增子公司
          </Button>
        </div>
      )}
    </Modal>
  );
};

// ── 新增子公司 Modal ──

export const ClientSubModal: React.FC<ClientSubModalProps> = ({
  open, subParentId, subForm, clients,
  onClose, onFormChange, onSave,
}) => {
  return (
    <Modal
      title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>新增子公司</span>}
      open={open}
      onCancel={onClose}
      width={860}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button icon={<CloseOutlined />} onClick={onClose}
            style={{ borderRadius: 3, width: 36, height: 36 }} />
          <Button type="primary" ghost icon={<CheckOutlined />} onClick={onSave}
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
            <td style={LABEL_CELL_STYLE}>子公司名称</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <input value={subForm.name}
                onChange={e => onFormChange({ name: e.target.value })}
                placeholder="输入简称"
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
            <td style={LABEL_CELL_STYLE}>编号</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <input value={subForm.code}
                onChange={e => onFormChange({ code: e.target.value })}
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
          </tr>
          <tr>
            <td style={LABEL_CELL_STYLE}>行业</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <IndustryDropdown value={subForm.industry} onChange={val => onFormChange({ industry: val })} />
            </td>
            <td style={LABEL_CELL_STYLE}>区域</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                onClick={() => {
                  const cur = REGIONS.indexOf(subForm.region || '');
                  onFormChange({ region: REGIONS[(cur + 1) % REGIONS.length] });
                }}>
                {subForm.region || '点击选择'} ▾
              </span>
            </td>
          </tr>
          <tr>
            <td style={LABEL_CELL_STYLE}>区域销售</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <input value={subForm.salesman || ''}
                onChange={e => onFormChange({ salesman: e.target.value })}
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
            </td>
            <td style={LABEL_CELL_STYLE}>信用等级</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                onClick={() => {
                  const levels: CreditLevel[] = ['A', 'B', 'C'];
                  const cur = levels.indexOf(subForm.creditLevel as CreditLevel);
                  onFormChange({ creditLevel: levels[(cur + 1) % levels.length] });
                }}>
                {subForm.creditLevel || '点击选择'} ▾
              </span>
            </td>
          </tr>
          <tr>
            <td style={LABEL_CELL_STYLE}>客户分级</td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                onClick={() => {
                  const grades: ClientGrade[] = ['A', 'B', 'C'];
                  const cur = grades.indexOf(subForm.grade as ClientGrade);
                  onFormChange({ grade: grades[(cur + 1) % grades.length] });
                }}>
                {subForm.grade || '点击选择'} ▾
              </span>
            </td>
            <td style={LABEL_CELL_STYLE}></td>
            <td style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}></td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
        显示为：{clients.find(c => c.id === subParentId)?.name}（{subForm.name || '...'}）
      </div>
    </Modal>
  );
};
