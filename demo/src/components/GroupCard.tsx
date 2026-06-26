import React from 'react';
import { Card, Button, Tag, Badge, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Group, GroupItem } from '../types';
import EditableItemTable from './ItemTable';
import { calcGroupSummary, formatMoney } from '../utils/calculations';

interface Props {
  group: Group;
  onGroupChange: (groupId: string, items: GroupItem[]) => void;
  onAddItem: (groupId: string) => void;
  onDeleteItem: (groupId: string, itemId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onGroupNameChange?: (groupId: string, name: string) => void;
}

const groupTypeConfig: Record<string, { label: string; color: string }> = {
  EQUIPMENT:              { label: '设备组',        color: '#00509e' },
  INTEGRATION:            { label: '集成开发',      color: '#5a2d82' },
  PACKAGING_TRANSPORT:    { label: '包装运输',      color: '#006b6b' },
  PROJECT_DELIVERY:       { label: '项目交付',      color: '#1a6b3c' },
  IMPLEMENTATION_EXPENSE: { label: '差旅和管理',    color: '#c76a00' },
  OTHER:                  { label: '其他',          color: '#c76a00' },
};

const GroupCard: React.FC<Props> = ({ group, onGroupChange, onAddItem, onDeleteItem, onDeleteGroup, onGroupNameChange }) => {
  const gtype = groupTypeConfig[group.group_type] || { label: group.group_type, color: 'default' };
  const summary = calcGroupSummary(group.items);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderRadius: 4, borderLeft: `4px solid ${group.is_fixed ? '#00509e' : '#1a6b3c'}` }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <Tag color={gtype.color} style={{ minWidth: 64, textAlign: 'center' }}>{gtype.label}</Tag>
          {!group.is_fixed && onGroupNameChange && (
            <Tag style={{ fontSize: 11 }}>{group.name}</Tag>
          )}
          {group.is_fixed && <Tag style={{ fontSize: 11 }}>固定</Tag>}
          <Badge
            count={`¥${formatMoney(summary.total_accounting_price)}`}
            style={{ backgroundColor: '#00509e', fontWeight: 600, minWidth: 110 }}
            overflowCount={999999999}
          />
          <div style={{ flex: 1 }} />
          {!group.is_fixed && onDeleteGroup && (
            <Tooltip title="删除组">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDeleteGroup(group.id)} />
            </Tooltip>
          )}
          <Tooltip title="添加组件">
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => onAddItem(group.id)} />
          </Tooltip>
        </div>
      }
    >
      <EditableItemTable
        items={group.items}
        onItemsChange={(items) => onGroupChange(group.id, items)}
        onDeleteItem={(itemId) => onDeleteItem(group.id, itemId)}
        groupType={group.group_type}
      />
    </Card>
  );
};

export default GroupCard;
