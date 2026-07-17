import React, { useState } from 'react';
import { Modal, Button } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import MaterialTagSelector from '../MaterialTagSelector';
import type { Component } from '../../types';
import { COLORS } from '../../styles/colors';
import { CATEGORIES, CATEGORY_OPTIONS, TYPE_ABBREV, SOURCES, UNITS, LABEL_CELL_STYLE } from './materialConstants';

// ── Edit/Create Modal ──

interface MaterialEditModalProps {
  open: boolean;
  editingId: string | null;
  editForm: Partial<Component>;
  onFormChange: (form: Partial<Component>) => void;
  onClose: () => void;
  onSave: () => void;
}

export const MaterialEditModal: React.FC<MaterialEditModalProps> = ({
  open,
  editingId,
  editForm,
  onFormChange,
  onClose,
  onSave,
}) => {
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);

  return (
    <Modal
      title={
        <span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>
          {editingId ? '编辑物料' : '新增物料'}
        </span>
      }
      open={open}
      onCancel={onClose}
      width={920}
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
      <div style={{
        background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5,
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>物料信息</span>
          <span style={{ fontSize: 11, color: COLORS.textLight, marginLeft: 8 }}>
            编码格式：{'{类型缩写2位}-{用途6位}-{规格6位}-V{版本}'}
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
                  onChange={e => onFormChange({ ...editForm, code: e.target.value })}
                  placeholder="EQ-ABCDEF-123456-V1.0"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box', fontFamily: 'monospace', fontWeight: 600 }} />
              </td>
              <td style={LABEL_CELL_STYLE}>物料名称</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.nameCn || ''}
                  onChange={e => onFormChange({ ...editForm, nameCn: e.target.value })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>类型</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, paddingLeft: 2 }}
                    onClick={() => {
                      const cur = CATEGORIES.indexOf((editForm.category as ItemType) || 'COMPLETE_SET');
                      onFormChange({ ...editForm, category: CATEGORIES[(cur + 1) % CATEGORIES.length] });
                    }}>
                    {editForm.category ? CATEGORY_OPTIONS[editForm.category as ItemType]?.label || editForm.category : '点击选择'} ▾
                  </span>
                  <span style={{ fontSize: 10, color: COLORS.textLight }}>
                    编码前缀：<strong>{TYPE_ABBREV[editForm.category as ItemType] || '?'}</strong>
                  </span>
                </div>
              </td>
              <td style={LABEL_CELL_STYLE}>品牌</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.brand || ''}
                  onChange={e => onFormChange({ ...editForm, brand: e.target.value })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>供应商</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.supplier || ''}
                  onChange={e => onFormChange({ ...editForm, supplier: e.target.value })}
                  placeholder="贸易商/代理商/厂商"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
              <td style={LABEL_CELL_STYLE}>型号</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.model || ''}
                  onChange={e => onFormChange({ ...editForm, model: e.target.value })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
              <td style={LABEL_CELL_STYLE}>规格</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.specification || ''}
                  onChange={e => onFormChange({ ...editForm, specification: e.target.value })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>来源</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                  onClick={() => {
                    const cur = SOURCES.findIndex(s => s.value === editForm.sourcingType);
                    const next = SOURCES[(cur + 1) % SOURCES.length];
                    onFormChange({ ...editForm, sourcingType: next.value });
                  }}>
                  {editForm.sourcingType === 'PURCHASED' ? '外购' : editForm.sourcingType === 'SELF_MANUFACTURED' ? '自制' : '点击选择'} ▾
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
                          onClick={() => { onFormChange({ ...editForm, unit: u }); setUnitDropdownOpen(false); }}
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
                <input type="number" min={0} value={editForm.unitCost ?? ''}
                  onChange={e => onFormChange({ ...editForm, unitCost: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>设计工时</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input type="number" min={0} value={editForm.designHours ?? ''}
                  onChange={e => onFormChange({ ...editForm, designHours: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
              <td style={LABEL_CELL_STYLE}>装配工时</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input type="number" min={0} value={editForm.assemblyHours ?? ''}
                  onChange={e => onFormChange({ ...editForm, assemblyHours: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 13, padding: '2px 0', margin: 0, display: 'block', boxSizing: 'border-box', lineHeight: 1.3 }} />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>质保</td>
              <td style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12 }}
                  onClick={() => onFormChange({ ...editForm, hasWarranty: !editForm.hasWarranty })}>
                  {editForm.hasWarranty ? '是' : '否'} ▾
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
                  onChange={val => onFormChange({ ...editForm, tags: val })}
                />
              </td>
            </tr>
            <tr>
              <td style={LABEL_CELL_STYLE}>说明</td>
              <td colSpan={5} style={{ padding: '7px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, verticalAlign: 'middle' }}>
                <input value={editForm.note || ''}
                  onChange={e => onFormChange({ ...editForm, note: e.target.value })}
                  placeholder="物料用途、技术参数补充说明…"
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box' }} />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
          编码规则：{'{类型缩写2位}-{用途6位}-{规格6位}-V{版本}'}，如 EQ-ABCDEF-123456-V1.0。V0.x = 临时物料，V1.0+ = 正式物料。
          新建或编辑后物料状态自动变为"草稿"，提交审核后由总监审批。
        </div>
      </div>
    </Modal>
  );
};

// ── Delete Confirm Modal ──

interface MaterialDeleteModalProps {
  item: Component | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const MaterialDeleteModal: React.FC<MaterialDeleteModalProps> = ({
  item,
  onClose,
  onConfirm,
}) => {
  return (
    <Modal
      title={<span style={{ fontSize: 17, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.5 }}>删除物料</span>}
      open={!!item}
      onCancel={onClose}
      width={420}
      destroyOnHidden
      styles={{ body: { padding: '24px 28px 12px' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button icon={<CloseOutlined />} onClick={onClose}
            style={{ borderRadius: 3, width: 36, height: 36 }} />
          <Button type="primary" ghost icon={<CheckOutlined />} onClick={onConfirm}
            style={{ borderColor: COLORS.danger, color: COLORS.danger, borderRadius: 3, width: 36, height: 36 }} />
        </div>
      }
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 }}>
          {item?.note?.startsWith('[删除]')
            ? `确定永久删除物料"${item?.nameCn}"（${item?.code}）？`
            : `物料"${item?.nameCn}"（${item?.code}）的删除操作需总监审批，确认提交？`}
        </div>
      </div>
    </Modal>
  );
};
