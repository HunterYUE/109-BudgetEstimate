import React, { useState, useRef } from 'react';
import { Card, Button, Tag, Badge, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Group, GroupItem } from '../types';
import EditableItemTable from './ItemTable';
import { calcGroupSummary, formatMoney } from '../utils/calculations';
import { COLORS } from '../styles/constants';

interface Props {
  group: Group;
  onGroupChange: (groupId: string, items: GroupItem[]) => void;
  onAddItem: (groupId: string) => void;
  onDeleteItem: (groupId: string, itemId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onGroupNameChange?: (groupId: string, name: string) => void;
  editable?: boolean;
}

const groupTypeConfig: Record<string, { label: string; color: string }> = {
  EQUIPMENT:              { label: '设备组',        color: COLORS.primary },
  INTEGRATION:            { label: '集成开发',      color: COLORS.purple },
  PACKAGING_TRANSPORT:    { label: '包装运输',      color: '#006b6b' },
  PROJECT_DELIVERY:       { label: '项目交付',      color: COLORS.success },
  IMPLEMENTATION_EXPENSE: { label: '差旅和管理',    color: '#c76a00' },
  OTHER:                  { label: '其他',          color: '#c76a00' },
};

const GroupCard: React.FC<Props> = ({ group, onGroupChange, onAddItem, onDeleteItem, onDeleteGroup, onGroupNameChange, editable = true }) => {
  const gtype = groupTypeConfig[group.group_type] || { label: group.group_type, color: 'default' };
  const summary = calcGroupSummary(group.items);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startNameEdit = () => {
    setNameDraft(group.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const saveName = () => {
    if (nameDraft.trim() && nameDraft !== group.name && onGroupNameChange) {
      onGroupNameChange(group.id, nameDraft.trim());
    }
    setEditingName(false);
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16, borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        borderTop: `3px solid ${group.is_fixed ? COLORS.primary : COLORS.success}`,
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <Tag color={gtype.color} style={{ minWidth: 64, textAlign: 'center' }}>{gtype.label}</Tag>
          {!group.is_fixed && onGroupNameChange && (
            editingName ? (
              <input ref={nameInputRef} value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                onClick={e => e.stopPropagation()}
                style={{
                  border: `1px solid ${COLORS.primary}`, borderRadius: 3, padding: '2px 8px',
                  fontSize: 13, outline: 'none', fontFamily: 'inherit', width: 160,
                }} />
            ) : (
              <span onClick={e => { e.stopPropagation(); startNameEdit(); }}
                style={{
                  fontSize: 13, fontWeight: 600, color: COLORS.labelDark, cursor: 'pointer',
                  padding: '2px 6px', borderRadius: 3, border: '1px solid transparent',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.border = '1px solid #d0d6e0'; e.currentTarget.style.background = '#f5f7fa'; }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent'; }}
              >{group.name}</span>
            )
          )}
          {group.is_fixed && <Tag style={{ fontSize: 11 }}>固定</Tag>}
          <Badge
            count={`¥${formatMoney(summary.total_accounting_price)}`}
            style={{ backgroundColor: COLORS.primary, fontWeight: 600, minWidth: 110 }}
            overflowCount={999999999}
          />
          <div style={{ flex: 1 }} />
          {!group.is_fixed && onDeleteGroup && (
            <Tooltip title="删除组">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDeleteGroup(group.id)} />
            </Tooltip>
          )}
          {editable && <Tooltip title="添加组件">
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => onAddItem(group.id)} />
          </Tooltip>}
        </div>
      }
    >
      <EditableItemTable
        items={group.items}
        onItemsChange={(items) => onGroupChange(group.id, items)}
        onDeleteItem={(itemId) => onDeleteItem(group.id, itemId)}
        groupType={group.group_type}
        editing={editable}
      />
    </Card>
  );
};

export default GroupCard;
